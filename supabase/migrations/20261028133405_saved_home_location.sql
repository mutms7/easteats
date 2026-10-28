create table public.location_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  home_address jsonb not null,
  constraint valid_home_address check (
    jsonb_typeof(home_address) = 'object'
    and home_address - 'lat' - 'lng' - 'label' = '{}'::jsonb
    and jsonb_typeof(home_address->'lat') = 'number'
    and jsonb_typeof(home_address->'lng') = 'number'
    and jsonb_typeof(home_address->'label') = 'string'
    and (home_address->>'lat')::numeric between -90 and 90
    and (home_address->>'lng')::numeric between -180 and 180
    and length(btrim(home_address->>'label')) between 1 and 700
    and home_address ?& array['lat','lng','label']
  )
);
alter table public.location_preferences enable row level security;
revoke all on public.location_preferences from anon, public;
grant select, insert, update, delete on public.location_preferences to authenticated;
create policy "Read your home address" on public.location_preferences for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Save your home address" on public.location_preferences for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Update your home address" on public.location_preferences for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Clear your home address" on public.location_preferences for delete to authenticated
  using ((select auth.uid()) = user_id);
comment on table public.location_preferences is 'Private optional home address. Never include this data in shared restaurant records or taste interpretation requests.';
