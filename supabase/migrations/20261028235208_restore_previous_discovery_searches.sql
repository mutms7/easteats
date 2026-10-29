-- Import only the latest valid subscribed discovery for an account that has
-- never saved a conversation. Reuse its existing source job, never paid work.
lock table public.search_conversations in share row exclusive mode;
with latest as materialized (
 select distinct on (s.user_id) s.user_id,s.created_at as searched_at,j.id as job_id,j.input,j.status,j.place_ids
 from private.job_subscribers s join private.refresh_jobs j on j.id=s.job_id
 where j.kind='discovery'
 and case when jsonb_typeof(j.input->'lat')='number' then (j.input->>'lat')::numeric between -90 and 90 else false end
 and case when jsonb_typeof(j.input->'lng')='number' then (j.input->>'lng')::numeric between -180 and 180 else false end
 and not exists(select 1 from public.search_conversations c where c.user_id=s.user_id)
 order by s.user_id,s.created_at desc,j.created_at desc,j.id desc
), prepared as materialized (
 select l.*,gen_random_uuid() as conversation_id,
 case when l.input->>'searchId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then (l.input->>'searchId')::uuid else gen_random_uuid() end as search_id,
 (select left(r.record->>'city',80) from unnest(l.place_ids) with ordinality as p(id,position) join public.restaurants r on r.id=p.id
  where length(r.record->>'city') between 1 and 100 and r.record->>'city' ~ '^[[:alpha:] .''-]+$' order by p.position limit 1) as city
 from latest l
), inserted as (
 insert into public.search_conversations(id,user_id,title,title_status,input,area_label,result_snapshot,active_search_id,created_at,updated_at,last_opened_at)
 select conversation_id,user_id,case when city is not null then 'Your last search in '||city else 'Your last search' end,'fallback',
 jsonb_build_object(
  'searchId',search_id,'savedSearchId',conversation_id,'lat',input->'lat','lng',input->'lng',
  'radiusKm',case when jsonb_typeof(input->'radiusKm')='number' then case when (input->>'radiusKm')::numeric between .5 and 50 then input->'radiusKm' else '5'::jsonb end else '5'::jsonb end,
  'mode',case when input->>'mode' in ('for-you','fusion') then input->>'mode' else 'for-you' end,
  'query',case when jsonb_typeof(input->'query')='string' then left(input->>'query',150) else '' end,
  'cuisine',case when jsonb_typeof(input->'cuisine')='string' then left(input->>'cuisine',80) else '' end,
  'areaLabel',coalesce(city,'Your last search'))
 ||case when jsonb_typeof(input->'foodType')='string' then jsonb_build_object('foodType',left(input->>'foodType',60)) else '{}'::jsonb end
 ||case when jsonb_typeof(input->'maxPrice')='number' then case when (input->>'maxPrice')::numeric between 1 and 4 and (input->>'maxPrice')::numeric=trunc((input->>'maxPrice')::numeric) then jsonb_build_object('maxPrice',(input->>'maxPrice')::integer) else '{}'::jsonb end else '{}'::jsonb end,
 coalesce(city,'Your last search'),
 jsonb_strip_nulls(jsonb_build_object('items','[]'::jsonb,'jobId',job_id,'refreshing',status in ('queued','starting','running','ingesting'),
  'warning',case when status in ('failed','uncertain','budget_limited') then 'The previous search did not finish. Refresh to try again.' when status in ('queued','starting','running','ingesting') then 'The previous search was still running.' else null end)),
 search_id,searched_at,searched_at,searched_at
 from prepared
 returning id,active_search_id,created_at
)
insert into private.search_conversation_runs(search_id,run_id,started_at) select id,active_search_id,created_at from inserted on conflict do nothing;
