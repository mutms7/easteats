create schema if not exists extensions;
create extension if not exists postgis with schema extensions;
create extension if not exists pgmq;
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

create table public.restaurants (
  id text primary key,
  record jsonb not null,
  location extensions.geography(Point,4326) not null,
  fetched_at timestamptz not null default now()
);
create index restaurants_location_idx on public.restaurants using gist(location);
create index restaurants_name_idx on public.restaurants using gin(to_tsvector('simple', record->>'name'));
create table public.restaurant_features (
  place_id text primary key references public.restaurants(id) on delete cascade,
  features jsonb not null,
  source_hash text not null,
  updated_at timestamptz not null default now()
);
create table public.taste_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  profile jsonb,
  answers jsonb not null default '{}',
  updated_at timestamptz not null default now()
);
create table public.saved_places (
  user_id uuid not null references auth.users(id) on delete cascade,
  place_id text not null references public.restaurants(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(user_id,place_id)
);
alter table public.restaurants enable row level security;
alter table public.restaurant_features enable row level security;
alter table public.taste_profiles enable row level security;
alter table public.saved_places enable row level security;
create policy restaurants_read on public.restaurants for select to authenticated using (true);
create policy features_read on public.restaurant_features for select to authenticated using (true);
create policy profiles_read on public.taste_profiles for select to authenticated using ((select auth.uid())=user_id);
create policy profiles_insert on public.taste_profiles for insert to authenticated with check ((select auth.uid())=user_id);
create policy profiles_update on public.taste_profiles for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy profiles_delete on public.taste_profiles for delete to authenticated using ((select auth.uid())=user_id);
create policy saved_read on public.saved_places for select to authenticated using ((select auth.uid())=user_id);
create policy saved_insert on public.saved_places for insert to authenticated with check ((select auth.uid())=user_id);
create policy saved_delete on public.saved_places for delete to authenticated using ((select auth.uid())=user_id);
revoke all on public.restaurants,public.restaurant_features,public.taste_profiles,public.saved_places from anon,authenticated;
grant select on public.restaurants,public.restaurant_features to authenticated;
grant select,insert,update,delete on public.taste_profiles to authenticated;
grant select,insert,delete on public.saved_places to authenticated;
grant all on public.restaurants,public.restaurant_features,public.taste_profiles,public.saved_places to service_role;

create table private.budgets(provider text primary key check(provider in ('apify','anthropic')), ceiling_usd numeric(12,6) not null check(ceiling_usd>=0));
insert into private.budgets values ('apify',120),('anthropic',40);
create table private.usage_ledger (
  id uuid primary key default gen_random_uuid(), provider text not null references private.budgets(provider), operation text not null,
  reserved_usd numeric(12,6) not null check(reserved_usd>=0), actual_usd numeric(12,6) check(actual_usd>=0),
  created_at timestamptz not null default now(), settled_at timestamptz, unique(provider,operation)
);
create table private.refresh_jobs (
  id uuid primary key default gen_random_uuid(), kind text not null check(kind in ('discovery','details','favorite-search')),
  dedupe_key text not null, input jsonb not null, status text not null default 'queued' check(status in ('queued','starting','running','ingesting','succeeded','failed','budget_limited','uncertain')),
  run_id text unique, dataset_id text, reservation_id uuid references private.usage_ledger(id), cursor_offset int not null default 0,
  queue_msg_id bigint, lease_until timestamptz, retries int not null default 0, error text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index refresh_jobs_dedupe_idx on private.refresh_jobs(dedupe_key,created_at desc);
create table private.job_subscribers(job_id uuid not null references private.refresh_jobs(id) on delete cascade,user_id uuid not null references auth.users(id) on delete cascade,created_at timestamptz not null default now(),primary key(job_id,user_id));
create index job_subscribers_user_idx on private.job_subscribers(user_id,created_at);
create table private.review_evidence(place_id text not null references public.restaurants(id) on delete cascade,review_id text not null,record jsonb not null,created_at timestamptz not null default now(),primary key(place_id,review_id));
alter table private.budgets enable row level security;
alter table private.usage_ledger enable row level security;
alter table private.refresh_jobs enable row level security;
alter table private.job_subscribers enable row level security;
alter table private.review_evidence enable row level security;
select pgmq.create('east_eats_refresh');

create function private.job_public(j private.refresh_jobs) returns jsonb language sql immutable set search_path='' as $$
select jsonb_strip_nulls(jsonb_build_object('id',j.id,'kind',j.kind,'status',case when j.status in ('starting','ingesting') then 'running' else j.status end,'createdAt',j.created_at,'error',j.error));
$$;
create function private.request_refresh(p_kind text,p_key text,p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare j private.refresh_jobs; uid uuid:=auth.uid(); mid bigint;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_kind not in ('discovery','details','favorite-search') or length(p_key)>2000 or octet_length(p_input::text)>8000 then raise exception 'Invalid refresh input'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_key,0));
  select * into j from private.refresh_jobs where dedupe_key=p_key and (status in ('queued','starting','running','ingesting','uncertain') or (status='succeeded' and created_at>now()-(case when p_kind='details' then interval '6 hours' else interval '24 hours' end))) order by created_at desc limit 1;
  if j.id is null then
    if (select count(*) from private.job_subscribers where user_id=uid and created_at>now()-interval '24 hours')>=30 then raise exception 'Daily refresh limit reached'; end if;
    insert into private.refresh_jobs(kind,dedupe_key,input) values(p_kind,p_key,p_input) returning * into j;
    select pgmq.send('east_eats_refresh',jsonb_build_object('job_id',j.id)) into mid;
    update private.refresh_jobs set queue_msg_id=mid where id=j.id;
  end if;
  insert into private.job_subscribers(job_id,user_id) values(j.id,uid) on conflict do nothing;
  return private.job_public(j);
end; $$;
create function public.request_refresh(p_kind text,p_key text,p_input jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.request_refresh(p_kind,p_key,p_input);$$;
create function private.get_refresh_job(p_id uuid) returns jsonb language sql security definer set search_path='' as $$
select private.job_public(j) from private.refresh_jobs j join private.job_subscribers s on s.job_id=j.id where j.id=p_id and s.user_id=(select auth.uid());$$;
create function public.get_refresh_job(p_id uuid) returns jsonb language sql security invoker set search_path='' as $$select private.get_refresh_job(p_id);$$;

create function public.nearby_restaurants(p_lat double precision,p_lng double precision,p_radius_km double precision default 5) returns setof jsonb language sql stable security invoker set search_path='' as $$
select r.record || jsonb_build_object('features',coalesce(f.features,'null'::jsonb))
from public.restaurants r left join public.restaurant_features f on f.place_id=r.id
where p_lat between -90 and 90 and p_lng between -180 and 180 and p_radius_km between .5 and 50
and extensions.st_dwithin(r.location,extensions.st_setsrid(extensions.st_makepoint(p_lng,p_lat),4326)::extensions.geography,p_radius_km*1000)
order by extensions.st_distance(r.location,extensions.st_setsrid(extensions.st_makepoint(p_lng,p_lat),4326)::extensions.geography) limit 250;$$;

create function private.reserve_usage(p_provider text,p_operation text,p_reserved_usd numeric) returns uuid language plpgsql security definer set search_path='' as $$
declare bid uuid; spent numeric; lim numeric;
begin
  if p_reserved_usd<=0 or p_reserved_usd>5 or length(p_operation)>300 then raise exception 'Invalid reservation'; end if;
  perform pg_advisory_xact_lock(hashtextextended('budget:'||p_provider,0));
  select id into bid from private.usage_ledger where provider=p_provider and operation=p_operation;
  if bid is not null then return bid; end if;
  select ceiling_usd into lim from private.budgets where provider=p_provider;
  if lim is null then raise exception 'Unknown provider'; end if;
  select coalesce(sum(coalesce(actual_usd,reserved_usd)),0) into spent from private.usage_ledger where provider=p_provider;
  if spent+p_reserved_usd>lim then return null; end if;
  insert into private.usage_ledger(provider,operation,reserved_usd) values(p_provider,p_operation,p_reserved_usd) returning id into bid;
  return bid;
end;$$;
create function public.reserve_usage(p_provider text,p_operation text,p_reserved_usd numeric) returns uuid language sql security invoker set search_path='' as $$select private.reserve_usage(p_provider,p_operation,p_reserved_usd);$$;
create function private.settle_usage(p_id uuid,p_actual_usd numeric) returns void language plpgsql security definer set search_path='' as $$
declare prov text; old_actual numeric;
begin
  if p_actual_usd<0 then raise exception 'Invalid charge'; end if;
  select provider,actual_usd into prov,old_actual from private.usage_ledger where id=p_id;
  if prov is null then raise exception 'Unknown reservation'; end if;
  perform pg_advisory_xact_lock(hashtextextended('budget:'||prov,0));
  update private.usage_ledger set actual_usd=case when actual_usd is null then p_actual_usd else greatest(actual_usd,p_actual_usd) end,settled_at=now() where id=p_id;
end;$$;
create function public.settle_usage(p_id uuid,p_actual_usd numeric) returns void language sql security invoker set search_path='' as $$select private.settle_usage(p_id,p_actual_usd);$$;

create function private.claim_refresh_jobs(p_limit int) returns jsonb language plpgsql security definer set search_path='' as $$
declare m record; j private.refresh_jobs; result jsonb:='[]';
begin
  update private.refresh_jobs set status='uncertain',error='Launch outcome unknown; manual reconciliation required',updated_at=now() where status='starting' and lease_until<now();
  for m in select * from pgmq.read('east_eats_refresh',90,least(greatest(p_limit,1),5)) loop
    select * into j from private.refresh_jobs where id=(m.message->>'job_id')::uuid for update skip locked;
    if j.id is not null and j.status in ('queued','running','ingesting') and (j.lease_until is null or j.lease_until<now()) then
      update private.refresh_jobs set lease_until=now()+interval '80 seconds',updated_at=now() where id=j.id;
      result:=result||jsonb_build_array(to_jsonb(j));
    elsif j.status in ('succeeded','failed','budget_limited','uncertain') then perform pgmq.archive('east_eats_refresh',m.msg_id); end if;
  end loop;
  return result;
end;$$;
create function public.claim_refresh_jobs(p_limit int default 3) returns jsonb language sql security invoker set search_path='' as $$select private.claim_refresh_jobs(p_limit);$$;
create function private.update_refresh_job(p_id uuid,p_status text,p_run_id text,p_dataset_id text,p_reservation_id uuid,p_offset int,p_error text) returns void language plpgsql security definer set search_path='' as $$
declare j private.refresh_jobs;
begin
  update private.refresh_jobs set status=p_status,run_id=coalesce(p_run_id,run_id),dataset_id=coalesce(p_dataset_id,dataset_id),reservation_id=coalesce(p_reservation_id,reservation_id),cursor_offset=coalesce(p_offset,cursor_offset),error=left(p_error,300),lease_until=case when p_status='starting' then now()+interval '2 minutes' else null end,updated_at=now() where id=p_id returning * into j;
  if j.id is null then raise exception 'Unknown job'; end if;
  if p_status in ('succeeded','failed','budget_limited','uncertain') and j.queue_msg_id is not null then perform pgmq.archive('east_eats_refresh',j.queue_msg_id); end if;
end;$$;
create function public.update_refresh_job(p_id uuid,p_status text,p_run_id text default null,p_dataset_id text default null,p_reservation_id uuid default null,p_offset int default null,p_error text default null) returns void language sql security invoker set search_path='' as $$select private.update_refresh_job(p_id,p_status,p_run_id,p_dataset_id,p_reservation_id,p_offset,p_error);$$;
create function private.get_job_by_run(p_run_id text) returns jsonb language sql security definer set search_path='' as $$select to_jsonb(j) from private.refresh_jobs j where run_id=p_run_id;$$;
create function public.get_job_by_run(p_run_id text) returns jsonb language sql security invoker set search_path='' as $$select private.get_job_by_run(p_run_id);$$;
create function private.ingest_place(p_record jsonb,p_reviews jsonb) returns void language plpgsql security definer set search_path='' as $$
declare r jsonb;
begin
  if jsonb_array_length(p_reviews)>40 then raise exception 'Too many reviews'; end if;
  insert into public.restaurants(id,record,location,fetched_at) values(p_record->>'id',p_record,extensions.st_setsrid(extensions.st_makepoint((p_record->>'lng')::float8,(p_record->>'lat')::float8),4326)::extensions.geography,(p_record->>'fetchedAt')::timestamptz)
  on conflict(id) do update set record=excluded.record,location=excluded.location,fetched_at=excluded.fetched_at;
  for r in select * from jsonb_array_elements(p_reviews) loop
    insert into private.review_evidence(place_id,review_id,record) values(p_record->>'id',r->>'id',jsonb_build_object('id',r->>'id','text',r->>'text','stars',r->'stars','publishedAt',r->'publishedAt','sourceUrl',r->>'sourceUrl')) on conflict(place_id,review_id) do nothing;
  end loop;
end;$$;
create function public.ingest_place(p_record jsonb,p_reviews jsonb) returns void language sql security invoker set search_path='' as $$select private.ingest_place(p_record,p_reviews);$$;

revoke all on all tables in schema private from public,anon,authenticated;
revoke execute on all functions in schema private from public,anon,authenticated;
grant execute on function private.request_refresh(text,text,jsonb),private.get_refresh_job(uuid) to authenticated;
grant execute on all functions in schema private to service_role;
revoke execute on function public.request_refresh(text,text,jsonb),public.get_refresh_job(uuid),public.nearby_restaurants(float8,float8,float8),public.reserve_usage(text,text,numeric),public.settle_usage(uuid,numeric),public.claim_refresh_jobs(int),public.update_refresh_job(uuid,text,text,text,uuid,int,text),public.get_job_by_run(text),public.ingest_place(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.request_refresh(text,text,jsonb),public.get_refresh_job(uuid),public.nearby_restaurants(float8,float8,float8) to authenticated;
grant execute on function public.request_refresh(text,text,jsonb),public.get_refresh_job(uuid),public.nearby_restaurants(float8,float8,float8),public.reserve_usage(text,text,numeric),public.settle_usage(uuid,numeric),public.claim_refresh_jobs(int),public.update_refresh_job(uuid,text,text,text,uuid,int,text),public.get_job_by_run(text),public.ingest_place(jsonb,jsonb) to service_role;
