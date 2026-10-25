-- Remove precise user coordinates from durable refresh inputs.
create function private.coarsen_refresh_input() returns trigger language plpgsql set search_path='' as $$
begin
  if jsonb_typeof(new.input->'lat')='number' then new.input:=jsonb_set(new.input,'{lat}',to_jsonb(round((new.input->>'lat')::numeric,2))); end if;
  if jsonb_typeof(new.input->'lng')='number' then new.input:=jsonb_set(new.input,'{lng}',to_jsonb(round((new.input->>'lng')::numeric,2))); end if;
  return new;
end;$$;
revoke execute on function private.coarsen_refresh_input() from public,anon,authenticated;
create trigger coarsen_refresh_input before insert or update of input on private.refresh_jobs for each row execute function private.coarsen_refresh_input();

create function private.retry_refresh_job(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare j private.refresh_jobs;
begin
  update private.refresh_jobs set retries=retries+1,status=case when retries>=2 then 'failed' when run_id is null then 'uncertain' when dataset_id is null then 'running' else 'ingesting' end,error='Refresh processing failed; retry available',lease_until=null,updated_at=now() where id=p_id returning * into j;
  if j.status in ('failed','uncertain') then perform pgmq.archive('east_eats_refresh',j.queue_msg_id); end if;
end;$$;
create function public.retry_refresh_job(p_id uuid) returns void language sql security invoker set search_path='' as $$select private.retry_refresh_job(p_id);$$;
revoke execute on function private.retry_refresh_job(uuid),public.retry_refresh_job(uuid) from public,anon,authenticated;
grant execute on function private.retry_refresh_job(uuid),public.retry_refresh_job(uuid) to service_role;

create function private.get_cached_features(p_place_id text) returns jsonb language sql stable security definer set search_path='' as $$select jsonb_build_object('sourceHash',source_hash,'features',features) from public.restaurant_features where place_id=p_place_id;$$;
create function public.get_cached_features(p_place_id text) returns jsonb language sql security invoker set search_path='' as $$select private.get_cached_features(p_place_id);$$;
create function private.put_features(p_place_id text,p_features jsonb,p_source_hash text) returns void language plpgsql security definer set search_path='' as $$
begin
  insert into public.restaurant_features(place_id,features,source_hash) values(p_place_id,p_features,p_source_hash) on conflict(place_id) do update set features=excluded.features,source_hash=excluded.source_hash,updated_at=now();
end;$$;
create function public.put_features(p_place_id text,p_features jsonb,p_source_hash text) returns void language sql security invoker set search_path='' as $$select private.put_features(p_place_id,p_features,p_source_hash);$$;
revoke execute on function private.get_cached_features(text),public.get_cached_features(text),private.put_features(text,jsonb,text),public.put_features(text,jsonb,text) from public,anon,authenticated;
grant execute on function private.get_cached_features(text),public.get_cached_features(text),private.put_features(text,jsonb,text),public.put_features(text,jsonb,text) to service_role;
grant usage on schema extensions to authenticated,service_role;

-- Keep reviewer-free evidence only as long as it is needed for refreshes.
create index review_evidence_created_idx on private.review_evidence(created_at);
create function private.prune_review_evidence() returns void language sql security definer set search_path='' as $$delete from private.review_evidence where created_at<now()-interval '30 days';$$;
create function public.prune_review_evidence() returns void language sql security invoker set search_path='' as $$select private.prune_review_evidence();$$;
revoke execute on function private.prune_review_evidence(),public.prune_review_evidence() from public,anon,authenticated;
grant execute on function private.prune_review_evidence(),public.prune_review_evidence() to service_role;
