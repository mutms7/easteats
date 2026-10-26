-- A search UUID identifies one user submission, including terminal outcomes.
-- New submissions use new UUIDs; status polling never starts another paid run.
create or replace function private.request_refresh(p_kind text,p_key text,p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j private.refresh_jobs; uid uuid:=auth.uid(); mid bigint;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_kind not in ('discovery','details','favorite-search') or length(p_key)>2000 or octet_length(p_input::text)>8000 then raise exception 'Invalid refresh input'; end if;
  if p_input ? 'searchId' and (jsonb_typeof(p_input->'searchId')<>'string' or (p_input->>'searchId')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then raise exception 'Invalid search ID'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_key,0));
  select * into j from private.refresh_jobs where dedupe_key=p_key and (
    p_input ? 'searchId' or status in ('queued','starting','running','ingesting','uncertain') or
    (status='succeeded' and created_at>now()-(case when p_kind='details' then interval '6 hours' else interval '24 hours' end))
  ) order by created_at desc limit 1;
  if j.id is null then
    if (select count(*) from private.job_subscribers where user_id=uid and created_at>now()-interval '24 hours')>=30 then raise exception 'Daily refresh limit reached'; end if;
    insert into private.refresh_jobs(kind,dedupe_key,input) values(p_kind,p_key,p_input) returning * into j;
    select pgmq.send('east_eats_refresh',jsonb_build_object('job_id',j.id)) into mid;
    update private.refresh_jobs set queue_msg_id=mid where id=j.id;
  end if;
  insert into private.job_subscribers(job_id,user_id) values(j.id,uid) on conflict do nothing;
  return private.job_public(j);
end;$$;

create or replace function private.claim_refresh_jobs(p_limit int) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j private.refresh_jobs; result jsonb:='[]';
begin
  update private.refresh_jobs set status='uncertain',error='Launch outcome unknown; manual reconciliation required',updated_at=now()
  where status='starting' and lease_until<now();
  for j in
    select * from private.refresh_jobs
    where status in ('queued','running','ingesting') and (lease_until is null or lease_until<now())
    order by case kind when 'favorite-search' then 0 when 'discovery' then 1 else 2 end,created_at,id
    limit least(greatest(p_limit,1),5) for update skip locked
  loop
    if j.queue_msg_id is not null then perform pgmq.set_vt('east_eats_refresh',j.queue_msg_id,330); end if;
    update private.refresh_jobs set lease_until=now()+interval '300 seconds',updated_at=now() where id=j.id;
    result:=result||jsonb_build_array(to_jsonb(j));
  end loop;
  return result;
end;$$;
