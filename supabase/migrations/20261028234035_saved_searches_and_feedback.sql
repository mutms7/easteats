create table public.search_conversations (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (length(title) between 1 and 120),
  title_status text not null default 'pending' check (title_status in ('pending','generating','ready','fallback')),
  input jsonb not null check (jsonb_typeof(input)='object' and octet_length(input::text)<=20000),
  area_label text not null default '' check (length(area_label)<=700),
  result_snapshot jsonb not null default '{"items":[]}' check (jsonb_typeof(result_snapshot)='object' and octet_length(result_snapshot::text)<=4194304),
  active_search_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_opened_at timestamptz not null default now()
);
create index search_conversations_owner_recency on public.search_conversations(user_id,last_opened_at desc,id);

create table public.restaurant_feedback (
  user_id uuid not null references auth.users(id) on delete cascade,
  place_id text not null references public.restaurants(id) on delete cascade,
  sentiment text not null check (sentiment in ('like','dislike','neutral')),
  reason text check (reason in ('food','value','service','atmosphere','overall')),
  note text check (length(note)<=1500),
  updated_at timestamptz not null default now(),
  primary key(user_id,place_id)
);
create index restaurant_feedback_place on public.restaurant_feedback(place_id);

create table public.meal_checkins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  place_id text not null references public.restaurants(id) on delete cascade,
  search_id uuid references public.search_conversations(id) on delete set null,
  chosen_at timestamptz not null default now(),
  answered_at timestamptz
);
create index meal_checkins_place on public.meal_checkins(place_id);
create index meal_checkins_search on public.meal_checkins(search_id);

alter table public.search_conversations enable row level security;
alter table public.restaurant_feedback enable row level security;
alter table public.meal_checkins enable row level security;
create policy search_conversations_owner on public.search_conversations for all to authenticated
  using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy restaurant_feedback_owner on public.restaurant_feedback for all to authenticated
  using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy meal_checkins_owner on public.meal_checkins for all to authenticated
  using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id and (search_id is null or exists(select 1 from public.search_conversations s where s.id=search_id and s.user_id=(select auth.uid()))));
revoke all on public.search_conversations,public.restaurant_feedback,public.meal_checkins from public,anon;
grant select,insert,update,delete on public.search_conversations,public.restaurant_feedback,public.meal_checkins to authenticated,service_role;

-- Private attempt/run ledgers cannot be reset by updating an owned public row.
create table private.search_title_attempts (search_id uuid primary key references public.search_conversations(id) on delete cascade,claimed_at timestamptz not null default now());
create table private.search_conversation_runs (search_id uuid not null references public.search_conversations(id) on delete cascade,run_id uuid not null,started_at timestamptz not null default now(),primary key(search_id,run_id));
alter table private.search_title_attempts enable row level security;
alter table private.search_conversation_runs enable row level security;
revoke all on private.search_title_attempts,private.search_conversation_runs from public,anon,authenticated;
grant all on private.search_title_attempts,private.search_conversation_runs to service_role;

create function private.begin_search_conversation(p_id uuid,p_run_id uuid,p_input jsonb,p_area_label text,p_title text) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=(select auth.uid()); current_row public.search_conversations; fresh_run uuid;
begin
  if uid is null then raise insufficient_privilege using message='Sign in required'; end if;
  if p_id is null or p_run_id is null or p_input is null or jsonb_typeof(p_input)<>'object' or length(coalesce(p_title,'')) not between 1 and 120 or length(coalesce(p_area_label,''))>700 then raise invalid_parameter_value using message='Invalid search'; end if;
  insert into public.search_conversations(id,user_id,title,input,area_label,active_search_id)
    values(p_id,uid,p_title,p_input,coalesce(p_area_label,''),p_run_id) on conflict(id) do nothing;
  select * into current_row from public.search_conversations where id=p_id for update;
  if current_row.user_id is distinct from uid then raise insufficient_privilege using message='Search unavailable'; end if;
  insert into private.search_conversation_runs(search_id,run_id) values(p_id,p_run_id) on conflict do nothing returning run_id into fresh_run;
  if fresh_run is not null then
    update public.search_conversations set input=p_input,area_label=coalesce(p_area_label,''),active_search_id=p_run_id,updated_at=now(),last_opened_at=now() where id=p_id returning * into current_row;
  end if;
  return to_jsonb(current_row);
end;$$;
create function public.begin_search_conversation(p_id uuid,p_run_id uuid,p_input jsonb,p_area_label text,p_title text) returns jsonb language sql security invoker set search_path='' as $$select private.begin_search_conversation(p_id,p_run_id,p_input,p_area_label,p_title);$$;

create function private.save_search_snapshot(p_id uuid,p_run_id uuid,p_snapshot jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=(select auth.uid()); current_row public.search_conversations;
begin
  if uid is null then raise insufficient_privilege using message='Sign in required'; end if;
  if p_snapshot is null or jsonb_typeof(p_snapshot)<>'object' or jsonb_typeof(p_snapshot->'items') is distinct from 'array' then raise invalid_parameter_value using message='Invalid snapshot'; end if;
  select * into current_row from public.search_conversations where id=p_id and user_id=uid for update;
  if current_row.id is null then raise insufficient_privilege using message='Search unavailable'; end if;
  if current_row.active_search_id=p_run_id then
    update public.search_conversations set result_snapshot=p_snapshot,updated_at=now() where id=p_id returning * into current_row;
  end if;
  return to_jsonb(current_row);
end;$$;
create function public.save_search_snapshot(p_id uuid,p_run_id uuid,p_snapshot jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.save_search_snapshot(p_id,p_run_id,p_snapshot);$$;

create function private.claim_search_title(p_id uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare claimed uuid; uid uuid:=(select auth.uid());
begin
  if uid is null then raise insufficient_privilege using message='Sign in required'; end if;
  perform 1 from public.search_conversations where id=p_id and user_id=uid and title_status='pending' for update;
  if not found then return false; end if;
  insert into private.search_title_attempts(search_id) values(p_id) on conflict do nothing returning search_id into claimed;
  if claimed is null then return false; end if;
  update public.search_conversations set title_status='generating' where id=p_id;
  return true;
end;$$;
create function public.claim_search_title(p_id uuid) returns boolean language sql security invoker set search_path='' as $$select private.claim_search_title(p_id);$$;

create function private.set_restaurant_feedback(p_place_id text,p_sentiment text,p_reason text,p_note text,p_answer_meal boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=(select auth.uid()); feedback public.restaurant_feedback;
begin
  if uid is null then raise insufficient_privilege using message='Sign in required'; end if;
  if p_sentiment is not null and p_sentiment not in ('like','dislike','neutral') or p_reason is not null and p_reason not in ('food','value','service','atmosphere','overall') or length(p_note)>1500 or p_answer_meal and p_sentiment is null then raise invalid_parameter_value using message='Invalid feedback'; end if;
  if not exists(select 1 from public.restaurants where id=p_place_id) then raise no_data_found using message='Place unavailable'; end if;
  perform pg_advisory_xact_lock(hashtextextended('feedback:'||uid::text,0));
  if p_sentiment is null then delete from public.restaurant_feedback where user_id=uid and place_id=p_place_id;
  else
    insert into public.restaurant_feedback(user_id,place_id,sentiment,reason,note) values(uid,p_place_id,p_sentiment,p_reason,nullif(btrim(p_note),''))
    on conflict(user_id,place_id) do update set sentiment=excluded.sentiment,reason=excluded.reason,note=excluded.note,updated_at=now()
    where (restaurant_feedback.sentiment,restaurant_feedback.reason,restaurant_feedback.note) is distinct from (excluded.sentiment,excluded.reason,excluded.note);
    select * into feedback from public.restaurant_feedback where user_id=uid and place_id=p_place_id;
  end if;
  if p_answer_meal then update public.meal_checkins set answered_at=now() where user_id=uid and place_id=p_place_id and answered_at is null; end if;
  if feedback.user_id is null then return null; end if;
  return jsonb_build_object('placeId',feedback.place_id,'sentiment',feedback.sentiment,'reason',feedback.reason,'note',feedback.note,'updatedAt',feedback.updated_at);
end;$$;
create function public.set_restaurant_feedback(p_place_id text,p_sentiment text default null,p_reason text default null,p_note text default null,p_answer_meal boolean default false) returns jsonb language sql security invoker set search_path='' as $$select private.set_restaurant_feedback(p_place_id,p_sentiment,p_reason,p_note,p_answer_meal);$$;

create function private.choose_meal(p_place_id text,p_search_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=(select auth.uid()); meal public.meal_checkins;
begin
  if uid is null then raise insufficient_privilege using message='Sign in required'; end if;
  if not exists(select 1 from public.restaurants where id=p_place_id) then raise no_data_found using message='Place unavailable'; end if;
  if p_search_id is not null and not exists(select 1 from public.search_conversations where id=p_search_id and user_id=uid) then raise insufficient_privilege using message='Search unavailable'; end if;
  perform pg_advisory_xact_lock(hashtextextended('feedback:'||uid::text,0));
  insert into public.meal_checkins(user_id,place_id,search_id) values(uid,p_place_id,p_search_id)
  on conflict(user_id) do update set place_id=excluded.place_id,search_id=excluded.search_id,chosen_at=now(),answered_at=null
    where (meal_checkins.place_id,meal_checkins.search_id) is distinct from (excluded.place_id,excluded.search_id) or meal_checkins.answered_at is not null;
  select * into meal from public.meal_checkins where user_id=uid;
  return jsonb_build_object('placeId',meal.place_id,'searchId',meal.search_id,'chosenAt',meal.chosen_at,'answeredAt',meal.answered_at);
end;$$;
create function public.choose_meal(p_place_id text,p_search_id uuid default null) returns jsonb language sql security invoker set search_path='' as $$select private.choose_meal(p_place_id,p_search_id);$$;

revoke execute on function private.begin_search_conversation(uuid,uuid,jsonb,text,text),private.save_search_snapshot(uuid,uuid,jsonb),private.claim_search_title(uuid),private.set_restaurant_feedback(text,text,text,text,boolean),private.choose_meal(text,uuid) from public,anon,authenticated;
revoke execute on function public.begin_search_conversation(uuid,uuid,jsonb,text,text),public.save_search_snapshot(uuid,uuid,jsonb),public.claim_search_title(uuid),public.set_restaurant_feedback(text,text,text,text,boolean),public.choose_meal(text,uuid) from public,anon,authenticated;
grant execute on function private.begin_search_conversation(uuid,uuid,jsonb,text,text),private.save_search_snapshot(uuid,uuid,jsonb),private.claim_search_title(uuid),private.set_restaurant_feedback(text,text,text,text,boolean),private.choose_meal(text,uuid) to authenticated,service_role;
grant execute on function public.begin_search_conversation(uuid,uuid,jsonb,text,text),public.save_search_snapshot(uuid,uuid,jsonb),public.claim_search_title(uuid),public.set_restaurant_feedback(text,text,text,text,boolean),public.choose_meal(text,uuid) to authenticated,service_role;
