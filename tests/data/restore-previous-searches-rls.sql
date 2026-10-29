-- Test harness: run in BEGIN/ROLLBACK and replace the marker with the migration.
create temp table previous_search_proof as select gen_random_uuid() as owner_id,gen_random_uuid() as other_id,gen_random_uuid() as existing_owner_id,gen_random_uuid() as job_id,gen_random_uuid() as old_job_id,gen_random_uuid() as invalid_job_id,gen_random_uuid() as existing_search_id,gen_random_uuid() as existing_run_id,'__previous_search_'||gen_random_uuid()::text as place_id;
grant select on previous_search_proof to authenticated;
insert into auth.users(id,aud,role,email) select owner_id,'authenticated','authenticated',owner_id::text||'@example.invalid' from previous_search_proof union all select other_id,'authenticated','authenticated',other_id::text||'@example.invalid' from previous_search_proof union all select existing_owner_id,'authenticated','authenticated',existing_owner_id::text||'@example.invalid' from previous_search_proof;
insert into public.restaurants(id,record,location,fetched_at) select place_id,jsonb_build_object('id',place_id,'name','Fixture Noodles','city','Waterloo'),extensions.st_setsrid(extensions.st_makepoint(0,0),4326)::extensions.geography,now() from previous_search_proof;
insert into private.refresh_jobs(id,kind,dedupe_key,input,status,place_ids,created_at) select job_id,'discovery','proof:'||job_id,jsonb_build_object('lat',0,'lng',0,'searchId','not-valid','query',repeat('q',160),'cuisine',repeat('c',90),'foodType',repeat('f',70),'mode','unknown'),'succeeded',array[place_id],now()-interval '1 hour' from previous_search_proof
 union all select old_job_id,'discovery','proof:'||old_job_id,'{"lat":0,"lng":0,"query":"old"}'::jsonb,'succeeded','{}',now()-interval '1 day' from previous_search_proof
 union all select invalid_job_id,'discovery','proof:'||invalid_job_id,'{"city":"Waterloo"}'::jsonb,'succeeded','{}',now() from previous_search_proof;
insert into private.job_subscribers(job_id,user_id,created_at) select job_id,owner_id,now()-interval '1 hour' from previous_search_proof union all select job_id,other_id,now()-interval '1 hour' from previous_search_proof union all select job_id,existing_owner_id,now()-interval '1 hour' from previous_search_proof union all select old_job_id,owner_id,now()-interval '1 day' from previous_search_proof union all select invalid_job_id,owner_id,now() from previous_search_proof;
insert into public.search_conversations(id,user_id,title,input,active_search_id) select existing_search_id,existing_owner_id,'Keep existing conversation','{}',existing_run_id from previous_search_proof;
create temp table previous_search_counts as select (select count(*) from private.refresh_jobs) as jobs,(select count(*) from private.usage_ledger) as usage;

-- APPLY BACKFILL HERE

do $$declare p record; a public.search_conversations; b public.search_conversations; begin
 select * into p from previous_search_proof;
 select * into a from public.search_conversations where user_id=p.owner_id;
 select * into b from public.search_conversations where user_id=p.other_id;
 if a.id is null or b.id is null or a.id=b.id then raise exception 'per-owner imported conversations missing or share identity'; end if;
 if a.result_snapshot->>'jobId'<>p.job_id::text or b.result_snapshot->>'jobId'<>p.job_id::text then raise exception 'latest valid subscribed job not restored'; end if;
 if a.title_status<>'fallback' or a.area_label<>'Waterloo' or a.input->>'radiusKm'<>'5' or a.input->>'mode'<>'for-you' or length(a.input->>'query')<>150 or length(a.input->>'cuisine')<>80 or length(a.input->>'foodType')<>60 then raise exception 'import validation/defaults incorrect'; end if;
 if (a.input->>'searchId')::uuid<>a.active_search_id or not exists(select 1 from private.search_conversation_runs where search_id=a.id and run_id=a.active_search_id) then raise exception 'import run identity ledger missing'; end if;
 if (select count(*) from public.search_conversations where user_id=p.existing_owner_id)<>1 or (select title from public.search_conversations where id=p.existing_search_id)<>'Keep existing conversation' then raise exception 'existing conversation overwritten'; end if;
 if (select count(*) from private.refresh_jobs)<>(select jobs from previous_search_counts) or (select count(*) from private.usage_ledger)<>(select usage from previous_search_counts) then raise exception 'backfill created paid work'; end if;
end;$$;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true) from previous_search_proof;
do $$begin
 if (select count(*) from public.search_conversations)<>1 then raise exception 'imported foreign conversation visible'; end if;
 if (select count(*) from public.search_places((select job_id from previous_search_proof)))<>1 then raise exception 'owned existing source results unavailable'; end if;
 if public.claim_search_title((select id from public.search_conversations)) is distinct from false then raise exception 'import should never trigger paid naming'; end if;
end;$$;
reset role;
select 'previous search import: latest valid owned job, per-owner IDs, RLS, no paid work, existing chats retained' as proof;
