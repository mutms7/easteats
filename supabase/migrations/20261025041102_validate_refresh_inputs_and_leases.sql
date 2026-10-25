create function private.validate_refresh_input() returns trigger language plpgsql set search_path='' as $$
declare u jsonb;
begin
  if jsonb_typeof(new.input)<>'object' then raise exception 'Refresh input must be an object'; end if;
  if new.input ? 'query' and (jsonb_typeof(new.input->'query')<>'string' or length(new.input->>'query')>200) then raise exception 'Invalid query'; end if;
  if new.input ? 'city' and (jsonb_typeof(new.input->'city')<>'string' or length(new.input->>'city')>150) then raise exception 'Invalid city'; end if;
  if new.input ? 'lat' and (jsonb_typeof(new.input->'lat')<>'number' or (new.input->>'lat')::numeric not between -90 and 90) then raise exception 'Invalid latitude'; end if;
  if new.input ? 'lng' and (jsonb_typeof(new.input->'lng')<>'number' or (new.input->>'lng')::numeric not between -180 and 180) then raise exception 'Invalid longitude'; end if;
  if new.input ? 'radiusKm' and (jsonb_typeof(new.input->'radiusKm')<>'number' or (new.input->>'radiusKm')::numeric not between .5 and 50) then raise exception 'Invalid radius'; end if;
  if new.kind='favorite-search' and length(trim(coalesce(new.input->>'query','')))<2 then raise exception 'Favorite search needs a restaurant name'; end if;
  if new.kind='discovery' and not ((new.input ? 'lat' and new.input ? 'lng') or length(trim(coalesce(new.input->>'city','')))>0) then raise exception 'Discovery needs a city or coordinates'; end if;
  if new.kind='details' then
    if jsonb_typeof(new.input->'urls') is distinct from 'array' then raise exception 'Details need Google Maps URLs'; end if;
    if jsonb_array_length(new.input->'urls') not between 1 and 20 then raise exception 'Invalid URL count'; end if;
    for u in select * from jsonb_array_elements(new.input->'urls') loop
      if jsonb_typeof(u)<>'string' or (u#>>'{}')!~'^https://(www\.|maps\.)?google\.com/' then raise exception 'Only Google Maps URLs are allowed'; end if;
    end loop;
  end if;
  return new;
end;$$;
revoke execute on function private.validate_refresh_input() from public,anon,authenticated;
create trigger validate_refresh_input before insert or update of input on private.refresh_jobs for each row execute function private.validate_refresh_input();

create or replace function private.claim_refresh_jobs(p_limit int) returns jsonb language plpgsql security definer set search_path='' as $$
declare m record; j private.refresh_jobs; result jsonb:='[]';
begin
  update private.refresh_jobs set status='uncertain',error='Launch outcome unknown; manual reconciliation required',updated_at=now() where status='starting' and lease_until<now();
  for m in select * from pgmq.read('east_eats_refresh',330,least(greatest(p_limit,1),5)) loop
    select * into j from private.refresh_jobs where id=(m.message->>'job_id')::uuid for update skip locked;
    if j.id is not null and j.status in ('queued','running','ingesting') and (j.lease_until is null or j.lease_until<now()) then
      update private.refresh_jobs set lease_until=now()+interval '300 seconds',updated_at=now() where id=j.id;
      result:=result||jsonb_build_array(to_jsonb(j));
    elsif j.status in ('succeeded','failed','budget_limited','uncertain') then perform pgmq.archive('east_eats_refresh',m.msg_id); end if;
  end loop;
  return result;
end;$$;
create or replace function private.update_refresh_job(p_id uuid,p_status text,p_run_id text,p_dataset_id text,p_reservation_id uuid,p_offset int,p_error text) returns void language plpgsql security definer set search_path='' as $$
declare j private.refresh_jobs;
begin
  update private.refresh_jobs set status=p_status,run_id=coalesce(p_run_id,run_id),dataset_id=coalesce(p_dataset_id,dataset_id),reservation_id=coalesce(p_reservation_id,reservation_id),cursor_offset=coalesce(p_offset,cursor_offset),error=left(p_error,300),lease_until=case when p_status in ('succeeded','failed','budget_limited','uncertain') then null else lease_until end,updated_at=now() where id=p_id returning * into j;
  if j.id is null then raise exception 'Unknown job'; end if;
  if p_status in ('succeeded','failed','budget_limited','uncertain') and j.queue_msg_id is not null then perform pgmq.archive('east_eats_refresh',j.queue_msg_id); end if;
end;$$;
create function private.release_refresh_job(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare j private.refresh_jobs;
begin
  update private.refresh_jobs set lease_until=null where id=p_id and status in ('queued','running','ingesting') returning * into j;
  if j.queue_msg_id is not null then perform pgmq.set_vt('east_eats_refresh',j.queue_msg_id,5); end if;
end;$$;
create function public.release_refresh_job(p_id uuid) returns void language sql security invoker set search_path='' as $$select private.release_refresh_job(p_id);$$;
revoke execute on function private.release_refresh_job(uuid),public.release_refresh_job(uuid) from public,anon,authenticated;
grant execute on function private.release_refresh_job(uuid),public.release_refresh_job(uuid) to service_role;
