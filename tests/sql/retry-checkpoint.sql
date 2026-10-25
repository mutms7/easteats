-- Run after migrations. Every synthetic job and queue/archive write rolls back.
begin;
do $proof$
declare jid uuid; mid bigint; n int; s text;
begin
  insert into private.refresh_jobs(kind,dedupe_key,input,status,run_id,dataset_id,cursor_offset,retries)
  values('discovery','retry-proof:'||gen_random_uuid()::text,'{"city":"Berkeley"}'::jsonb,'ingesting','proof-run:'||gen_random_uuid()::text,'proof-dataset',4,2)
  returning id into jid;
  select pgmq.send('east_eats_refresh',jsonb_build_object('job_id',jid)) into mid;
  update private.refresh_jobs set queue_msg_id=mid where id=jid;
  perform private.update_refresh_job(jid,'ingesting',null,null,null,4,null);
  select retries into n from private.refresh_jobs where id=jid;
  if n<>2 then raise exception 'Same offset reset retries'; end if;
  perform private.update_refresh_job(jid,'running',null,null,null,null,null);
  select retries into n from private.refresh_jobs where id=jid;
  if n<>2 then raise exception 'Status-only update reset retries'; end if;
  perform private.update_refresh_job(jid,'ingesting',null,null,null,5,null);
  select retries into n from private.refresh_jobs where id=jid;
  if n<>0 then raise exception 'Successful checkpoint did not reset retries'; end if;
  perform private.retry_refresh_job(jid);
  perform private.update_refresh_job(jid,'ingesting',null,null,null,5,null);
  select retries,status into n,s from private.refresh_jobs where id=jid;
  if n<>1 or s<>'ingesting' then raise exception 'First retry was reset or stopped early'; end if;
  perform private.retry_refresh_job(jid);
  perform private.update_refresh_job(jid,'ingesting',null,null,null,5,null);
  select retries,status into n,s from private.refresh_jobs where id=jid;
  if n<>2 or s<>'ingesting' then raise exception 'Second retry was reset or stopped early'; end if;
  perform private.retry_refresh_job(jid);
  select retries,status into n,s from private.refresh_jobs where id=jid;
  if n<>3 or s<>'failed' then raise exception 'Third failure did not retain the hard cap'; end if;
end $proof$;
rollback;
