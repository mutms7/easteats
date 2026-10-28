-- Synthetic accounts and addresses only. All changes roll back.
begin;
insert into auth.users(id,email) values
('fea2e801-1254-4000-a000-123456789001','home-fixture-a@example.invalid'),
('fea2e801-1254-4000-a000-123456789002','home-fixture-b@example.invalid');
insert into public.location_preferences(user_id,home_address) values
('fea2e801-1254-4000-a000-123456789001','{"lat":0,"lng":0,"label":"Test home A"}'),
('fea2e801-1254-4000-a000-123456789002','{"lat":1,"lng":1,"label":"Test home B"}');
set local role authenticated;
set local request.jwt.claim.sub='fea2e801-1254-4000-a000-123456789001';
do $$ begin
  if (select count(*) from public.location_preferences) <> 1 then raise exception 'Home isolation failed'; end if;
  update public.location_preferences set home_address='{"lat":2,"lng":2,"label":"Updated test home"}' where user_id='fea2e801-1254-4000-a000-123456789001';
  if not found then raise exception 'Owner update failed'; end if;
  delete from public.location_preferences where user_id='fea2e801-1254-4000-a000-123456789002';
  if found then raise exception 'Foreign home deletion allowed'; end if;
  begin
    update public.location_preferences set user_id='fea2e801-1254-4000-a000-123456789002';
    raise exception 'Ownership transfer allowed';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
do $$ begin
  if has_table_privilege('anon','public.location_preferences','SELECT') then raise exception 'Anonymous home access allowed'; end if;
  if (select count(*) from public.location_preferences where user_id in ('fea2e801-1254-4000-a000-123456789001','fea2e801-1254-4000-a000-123456789002')) <> 2 then raise exception 'Foreign row was changed'; end if;
end $$;
delete from auth.users where id='fea2e801-1254-4000-a000-123456789001';
do $$ begin
  if exists(select 1 from public.location_preferences where user_id='fea2e801-1254-4000-a000-123456789001') then raise exception 'Home did not cascade on account deletion'; end if;
end $$;
rollback;
