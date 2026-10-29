-- Run inside a transaction after the migration; all fixtures are rolled back.
create temp table saved_search_proof as select gen_random_uuid() as owner_id,gen_random_uuid() as other_id,gen_random_uuid() as search_id,gen_random_uuid() as other_search_id,gen_random_uuid() as run_id,gen_random_uuid() as refresh_id,'__saved_search_proof_'||gen_random_uuid()::text as place_id,'__saved_search_other_'||gen_random_uuid()::text as other_place_id;
grant select on saved_search_proof to authenticated;
insert into auth.users(id,aud,role,email) select owner_id,'authenticated','authenticated',owner_id::text||'@example.invalid' from saved_search_proof union all select other_id,'authenticated','authenticated',other_id::text||'@example.invalid' from saved_search_proof;
insert into public.restaurants(id,record,location,fetched_at) select place_id,'{}'::jsonb,extensions.st_setsrid(extensions.st_makepoint(0,0),4326)::extensions.geography,now() from saved_search_proof union all select other_place_id,'{}'::jsonb,extensions.st_setsrid(extensions.st_makepoint(0,0),4326)::extensions.geography,now() from saved_search_proof;
insert into public.search_conversations(id,user_id,title,input,active_search_id) select other_search_id,other_id,'Other private search','{}',run_id from saved_search_proof;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true) from saved_search_proof;
do $$declare p record; v jsonb; begin
 select * into p from saved_search_proof;
 v:=public.begin_search_conversation(p.search_id,p.run_id,'{}','Private address','Nearby food');
 if v->>'user_id'<>p.owner_id::text then raise exception 'own insert failed'; end if;
 if (select count(*) from public.search_conversations)<>1 then raise exception 'foreign search visible'; end if;
 begin perform public.begin_search_conversation(p.other_search_id,p.run_id,'{}','','Intrusion');raise exception 'foreign begin allowed';exception when insufficient_privilege then null;end;
 begin update public.search_conversations set user_id=p.other_id where id=p.search_id;raise exception 'owner reassignment allowed';exception when insufficient_privilege then null;end;
 if public.claim_search_title(p.search_id) is distinct from true or public.claim_search_title(p.search_id) is distinct from false then raise exception 'title double claim'; end if;
 update public.search_conversations set title_status='pending' where id=p.search_id;
 if public.claim_search_title(p.search_id) is distinct from false then raise exception 'title ledger reset'; end if;
 perform public.begin_search_conversation(p.search_id,p.refresh_id,'{}','','New refresh');
 perform public.begin_search_conversation(p.search_id,p.run_id,'{}','','Late old poll');
 perform public.save_search_snapshot(p.search_id,p.refresh_id,'{"items":[{"marker":"fresh"}]}');
 v:=public.save_search_snapshot(p.search_id,p.run_id,'{"items":[{"marker":"old"}]}');
 if v->'result_snapshot'->'items'->0->>'marker'<>'fresh' then raise exception 'stale run overwrote current snapshot'; end if;
 if (v->>'result_count')::integer is distinct from 1 then raise exception 'generated summary result count is incorrect'; end if;
 perform public.choose_meal(p.place_id,p.search_id);
 perform public.set_restaurant_feedback(p.other_place_id,'like',null,null,true);
 if (select answered_at from public.meal_checkins where user_id=p.owner_id) is not null then raise exception 'wrong meal answered'; end if;
 perform public.set_restaurant_feedback(p.place_id,'like','food','Good noodles',true);
 if (select answered_at from public.meal_checkins where user_id=p.owner_id) is null then raise exception 'matching meal not answered'; end if;
 perform public.set_restaurant_feedback(p.place_id,'like','food','Good noodles',false);
 if (select count(*) from public.restaurant_feedback where place_id=p.place_id)<>1 then raise exception 'duplicate vote'; end if;
 perform public.set_restaurant_feedback(p.place_id,null,null,null,false);
 if exists(select 1 from public.restaurant_feedback where place_id=p.place_id) then raise exception 'vote not cleared'; end if;
 begin perform public.set_restaurant_feedback(p.place_id,null,null,null,true);raise exception 'empty vote answered meal';exception when invalid_parameter_value then null;end;
 begin perform public.choose_meal(p.place_id,p.other_search_id);raise exception 'foreign meal search allowed';exception when insufficient_privilege then null;end;
 begin update public.meal_checkins set search_id=p.other_search_id where user_id=p.owner_id;raise exception 'foreign meal reference allowed';exception when insufficient_privilege then null;end;
 begin perform 1 from private.search_title_attempts;raise exception 'title ledger exposed';exception when insufficient_privilege then null;end;
 if has_table_privilege('anon','public.search_conversations','SELECT') or has_table_privilege('anon','public.restaurant_feedback','SELECT') or has_function_privilege('anon','public.claim_search_title(uuid)','EXECUTE') then raise exception 'anonymous access'; end if;
end;$$;
select set_config('request.jwt.claims',jsonb_build_object('sub',other_id,'role','authenticated')::text,true) from saved_search_proof;
do $$begin
 if (select count(*) from public.search_conversations)<>1 or exists(select 1 from public.restaurant_feedback) or exists(select 1 from public.meal_checkins) then raise exception 'cross-account data visible'; end if;
end;$$;
reset role;
delete from auth.users where id=(select owner_id from saved_search_proof);
do $$begin
 if exists(select 1 from public.search_conversations where user_id=(select owner_id from saved_search_proof)) or exists(select 1 from public.restaurant_feedback where user_id=(select owner_id from saved_search_proof)) or exists(select 1 from public.meal_checkins where user_id=(select owner_id from saved_search_proof)) or exists(select 1 from private.search_title_attempts where search_id=(select search_id from saved_search_proof)) then raise exception 'account deletion did not cascade'; end if;
end;$$;
select 'saved search RLS, one title claim, stale-run isolation, feedback/meal ownership, account cascade passed' as proof;
