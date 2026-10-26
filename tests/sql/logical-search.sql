-- No provider calls. Synthetic jobs, subscriptions and queue changes roll back.
begin;
do $proof$
declare uid uuid; first_id uuid; second_id uuid; search_one uuid:=gen_random_uuid(); search_two uuid:=gen_random_uuid(); result jsonb; business text; n int;
begin
 select u.id into uid from auth.users u order by (select count(*) from private.job_subscribers s where s.user_id=u.id) limit 1;
 if uid is null then raise exception 'A test account is required'; end if;
 perform set_config('request.jwt.claim.sub',uid::text,true);
 result:=private.request_refresh('discovery','proof:'||search_one::text,jsonb_build_object('lat',43.52,'lng',-80.52,'searchId',search_one));first_id:=(result->>'id')::uuid;
 result:=private.request_refresh('discovery','proof:'||search_one::text,jsonb_build_object('lat',43.52,'lng',-80.52,'searchId',search_one));
 if (result->>'id')::uuid<>first_id then raise exception 'Polling duplicated work'; end if;
 perform private.update_refresh_job(first_id,'succeeded',null,null,null,null,null);
 result:=private.request_refresh('discovery','proof:'||search_one::text,jsonb_build_object('lat',43.52,'lng',-80.52,'searchId',search_one));
 if (result->>'id')::uuid<>first_id or result->>'status'<>'succeeded' then raise exception 'Completed replay duplicated work'; end if;
 perform private.update_refresh_job(first_id,'failed',null,null,null,null,'Synthetic failure');
 result:=private.request_refresh('discovery','proof:'||search_one::text,jsonb_build_object('lat',43.52,'lng',-80.52,'searchId',search_one));
 if (result->>'id')::uuid<>first_id or result->>'status'<>'failed' then raise exception 'Failed replay duplicated paid work'; end if;
 result:=private.request_refresh('discovery','proof:'||search_two::text,jsonb_build_object('lat',43.52,'lng',-80.52,'searchId',search_two));second_id:=(result->>'id')::uuid;
 if second_id=first_id then raise exception 'New submission reused previous job'; end if;
 select id into business from public.restaurants limit 1;
 perform private.record_search_place(second_id,business);perform private.record_search_place(second_id,business);
 select cardinality(place_ids) into n from private.refresh_jobs where id=second_id;
 if n<>1 then raise exception 'Source membership duplicated'; end if;
 select count(*) into n from private.search_places(second_id);
 if n<>1 then raise exception 'Subscriber cannot read published matches'; end if;
 perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
 begin
  perform private.search_places(second_id);
  raise exception 'Unsubscribed caller could read source membership';
 exception when insufficient_privilege then null;
 end;
 if has_function_privilege('authenticated','public.record_search_place(uuid,text)','execute') then raise exception 'Client can forge source membership'; end if;
 if has_function_privilege('anon','public.search_places(uuid)','execute') then raise exception 'Anonymous caller can read source membership'; end if;
end $proof$;
rollback;
