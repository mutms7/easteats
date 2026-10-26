alter table private.refresh_jobs add column place_ids text[] not null default '{}';

create function private.record_search_place(p_job_id uuid,p_place_id text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.restaurants where id=p_place_id) then raise exception 'Unknown place'; end if;
  update private.refresh_jobs set place_ids=array_append(place_ids,p_place_id),updated_at=now()
  where id=p_job_id and not(p_place_id=any(place_ids)) and cardinality(place_ids)<250;
end;$$;
revoke execute on function private.record_search_place(uuid,text) from public,anon,authenticated;
grant execute on function private.record_search_place(uuid,text) to service_role;
create function public.record_search_place(p_job_id uuid,p_place_id text) returns void
language sql security invoker set search_path='' as $$select private.record_search_place(p_job_id,p_place_id);$$;
revoke execute on function public.record_search_place(uuid,text) from public,anon,authenticated;
grant execute on function public.record_search_place(uuid,text) to service_role;

create function private.search_places(p_job_id uuid) returns setof jsonb
language plpgsql stable security definer set search_path='' as $$
declare j private.refresh_jobs; uid uuid:=auth.uid();
begin
  if uid is null or not exists(select 1 from private.job_subscribers where job_id=p_job_id and user_id=uid) then raise exception 'Search access denied' using errcode='42501'; end if;
  select * into j from private.refresh_jobs where id=p_job_id;
  return query select r.record||jsonb_build_object('features',coalesce(f.features,'null'::jsonb))
  from public.restaurants r left join public.restaurant_features f on f.place_id=r.id
  where r.id=any(j.place_ids) order by array_position(j.place_ids,r.id);
end;$$;
revoke execute on function private.search_places(uuid) from public,anon;
grant execute on function private.search_places(uuid) to authenticated;
create function public.search_places(p_job_id uuid) returns setof jsonb
language sql stable security invoker set search_path='' as $$select * from private.search_places(p_job_id);$$;
revoke execute on function public.search_places(uuid) from public,anon;
grant execute on function public.search_places(uuid) to authenticated;
