-- No provider calls. All synthetic records, leases, and queue writes roll back.
begin;
do $proof$
declare favorite uuid; background uuid; claimed jsonb; base public.restaurants; pid text; label text; city text:='SearchProof'||gen_random_uuid()::text; n int;
begin
  update private.refresh_jobs set lease_until=now()+interval '1 hour' where status in ('queued','running','ingesting');
  insert into private.refresh_jobs(kind,dedupe_key,input,status,created_at)
  values('discovery','proof:'||gen_random_uuid()::text,'{"city":"Berkeley"}','queued',now()-interval '1 day') returning id into background;
  insert into private.refresh_jobs(kind,dedupe_key,input,status)
  values('favorite-search','proof:'||gen_random_uuid()::text,'{"query":"Pho 99","city":"Coquitlam"}','queued') returning id into favorite;
  claimed:=private.claim_refresh_jobs(1);
  if (claimed->0->>'id')::uuid is distinct from favorite then raise exception 'Favorite lookup did not take priority'; end if;
  claimed:=private.claim_refresh_jobs(1);
  if (claimed->0->>'id')::uuid is distinct from background then raise exception 'Claim lease did not protect active favorite lookup'; end if;
  if private.claim_refresh_jobs(1)<>'[]'::jsonb then raise exception 'Already leased work was claimed again'; end if;
  select * into base from public.restaurants limit 1;
  if base.id is null then raise exception 'Restaurant fixture required'; end if;
  foreach label in array array['Pho 99','Phở 99 Restaurant','Pho 99 Vietnamese Restaurant'] loop
    pid:='proof:'||gen_random_uuid()::text;
    insert into public.restaurants(id,record,location,fetched_at)
    values(pid,base.record||jsonb_build_object('id',pid,'name',label,'city',city),base.location,now());
  end loop;
  select count(*) into n from public.search_restaurants('Pho99',city);
  if n<>3 then raise exception 'Spacing-insensitive lookup failed'; end if;
  select count(*) into n from public.search_restaurants('PHỞ 99',city);
  if n<>3 then raise exception 'Accent-insensitive lookup failed'; end if;
  if has_function_privilege('anon','public.search_restaurants(text,text)','execute') then raise exception 'Anonymous lookup access granted'; end if;
  if not has_function_privilege('authenticated','public.search_restaurants(text,text)','execute') then raise exception 'Signed-in lookup access missing'; end if;
end $proof$;
rollback;
