-- Interactive favorite lookups must not wait behind review-enrichment jobs.
-- The locked job row is the claim authority; PGMQ still retains durable work.
create or replace function private.claim_refresh_jobs(p_limit int) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j private.refresh_jobs; result jsonb:='[]';
begin
  update private.refresh_jobs set status='uncertain',error='Launch outcome unknown; manual reconciliation required',updated_at=now()
  where status='starting' and lease_until<now();
  for j in
    select * from private.refresh_jobs
    where status in ('queued','running','ingesting') and (lease_until is null or lease_until<now())
    order by case when kind='favorite-search' then 0 else 1 end,created_at,id
    limit least(greatest(p_limit,1),5) for update skip locked
  loop
    if j.queue_msg_id is not null then perform pgmq.set_vt('east_eats_refresh',j.queue_msg_id,330); end if;
    update private.refresh_jobs set lease_until=now()+interval '300 seconds',updated_at=now() where id=j.id;
    result:=result||jsonb_build_array(to_jsonb(j));
  end loop;
  return result;
end;$$;

-- Accent and spacing differences should not hide cached Google Maps matches.
create extension if not exists unaccent with schema extensions;
create function public.search_restaurants(p_query text,p_city text default '') returns setof jsonb
language sql stable security invoker set search_path='' as $$
with terms as (
  select lower(regexp_replace(extensions.unaccent(p_query),'[^[:alnum:]]','','g')) as q,
         lower(regexp_replace(extensions.unaccent(coalesce(p_city,'')),'[^[:alnum:]]','','g')) as c
  where length(trim(p_query)) between 2 and 150 and length(coalesce(p_city,''))<=150
), candidates as (
  select r.record,lower(regexp_replace(extensions.unaccent(r.record->>'name'),'[^[:alnum:]]','','g')) as name,
         lower(regexp_replace(extensions.unaccent(r.record->>'city'),'[^[:alnum:]]','','g')) as city
  from public.restaurants r
)
select record from candidates,terms
where length(q)>0 and name like '%'||q||'%' and (c='' or city like '%'||c||'%')
order by case when name=q then 0 when name like q||'%' then 1 else 2 end,record->>'name'
limit 15;
$$;
revoke execute on function public.search_restaurants(text,text) from public,anon;
grant execute on function public.search_restaurants(text,text) to authenticated,service_role;
