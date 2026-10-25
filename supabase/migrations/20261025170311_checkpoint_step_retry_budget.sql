-- Successful dataset checkpoints start a new processing step's retry budget.
-- Same-offset retries and status changes must retain the current step's count.
create or replace function private.update_refresh_job(
  p_id uuid,p_status text,p_run_id text,p_dataset_id text,
  p_reservation_id uuid,p_offset int,p_error text
) returns void language plpgsql security definer set search_path='' as $$
declare j private.refresh_jobs;
begin
  update private.refresh_jobs set
    status=p_status,
    run_id=coalesce(p_run_id,run_id),
    dataset_id=coalesce(p_dataset_id,dataset_id),
    reservation_id=coalesce(p_reservation_id,reservation_id),
    -- SET expressions use the stored row, before cursor_offset is advanced.
    retries=case when p_offset>cursor_offset then 0 else retries end,
    cursor_offset=coalesce(p_offset,cursor_offset),
    error=left(p_error,300),
    lease_until=case when p_status in ('succeeded','failed','budget_limited','uncertain') then null else lease_until end,
    updated_at=now()
  where id=p_id returning * into j;
  if j.id is null then raise exception 'Unknown job'; end if;
  if p_status in ('succeeded','failed','budget_limited','uncertain') and j.queue_msg_id is not null then
    perform pgmq.archive('east_eats_refresh',j.queue_msg_id);
  end if;
end;$$;
