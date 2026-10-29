-- History navigation reads compact summaries, never large result snapshots.
alter table public.search_conversations add column result_count integer generated always as (coalesce(jsonb_array_length(result_snapshot->'items'),0)) stored;
