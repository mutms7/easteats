# East Eats database and worker

Apply the generated migrations in order to the dedicated East Eats project. No migration should run against another app. Restaurant data is authenticated read-only; taste profiles and saved places are owned by auth.uid(). Jobs, source review evidence, and usage accounting are private. All privileged RPC wrappers are service-only and use explicit private function grants.

## Runtime

Deploy `refresh-worker` and `apify-webhook` from this repository root so their imports include src/server/data and src/server/taste. `functions/import_map.json` pins Zod for the portable taste engine. Both functions have platform JWT verification disabled because they verify separate unguessable shared secrets. Do not expose either secret to clients.

Use the service-only `configure_worker_secrets(p_values jsonb)` RPC over HTTPS from a trusted server to store APIFY_TOKEN, ANTHROPIC_API_KEY, ANTHROPIC_EXTRACT_MODEL, WORKER_SECRET, APIFY_WEBHOOK_SECRET, and SUPABASE_URL in encrypted Vault records. Shared secrets must be at least 32 characters. Never print or commit these values. Public and authenticated users cannot execute either configuration RPC or read the Vault schema. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY remain the Edge bootstrap defaults, and the service key is never loaded from Vault. Nonempty Deno environment settings override Vault values.

Invoke `refresh-worker` with POST and `x-worker-secret`. The authenticated handler returns 202 immediately and registers its work with EdgeRuntime.waitUntil. Apify callbacks use `x-webhook-secret`, supplied by the Actor webhook headers template. A callback's dataset or final status is never trusted: the handler looks up the stored run and reads its status using the owner's Apify token.

The fourth migration installs a minutely Supabase Cron job. It invokes private.dispatch_refresh_worker, which reads the project URL and worker secret from Vault and uses net.http_post only while active jobs exist. The cron command contains no plaintext secrets. Outbound queue tables are denied to public/API user roles. A local Node runner can instead import processJobs from src/server/data/worker.ts and pass the service client and environment.

## RPC contracts

- `nearby_restaurants(p_lat,p_lng,p_radius_km=5)` returns Restaurant JSON rows with cached extracted features.
- `request_refresh(p_kind,p_key,p_input)` authenticates the requester, deduplicates active/shared runs, subscribes the user, rate limits new refreshes to 30/day/user, and returns `{id,status,kind,createdAt,error?}`.
- `get_refresh_job(p_id)` only returns jobs the caller subscribed to.
- `reserve_usage(p_provider,p_operation,p_reserved_usd)` returns a reservation UUID or null when the provider ceiling is reached. Providers are `apify` and `anthropic`. Each actual paid call needs its own operation identity. Reuse is only for an idempotent retry that will not repeat paid work.
- `settle_usage(p_id,p_actual_usd)` reconciles a known charge. Leave the reservation held if the provider outcome or usage is unknown.

All budget and processing RPCs are service-only. Caps default to $120 Apify and $40 Anthropic. The limit checks use database advisory transaction locks, so concurrent calls cannot oversubscribe the remaining budget.

## Processing rules

Actor input is bounded to 20 places and 40 recent reviews, with reviewer personal-data extraction disabled. Normalization whitelists business fields and review ID/text/stars/date/source URL; names and reviewer profiles/photos are discarded. Job coordinates are rounded to two decimals in a database trigger. Source review evidence expires after 30 days.

Each worker claims one job with a five-minute lease and a 330-second queue visibility timeout. It processes one restaurant per call, checkpoints it, then explicitly releases the job for the next poll. A failed processing step retries at most three times. An ambiguous Actor launch becomes `uncertain` and is never automatically relaunched, preserving its reservation for manual reconciliation. Duplicate callbacks and ingested review IDs are idempotent. Every model retry reserves a new budget operation, even if the previous response was malformed. Chunked extraction charges accumulate on the reservation; reservations are $0.10 for Haiku 5.5 and $0.50 for Haiku 4.5. Safe processing error codes are stored on jobs, with bounded redacted messages in worker logs.

Feature hashes include source reviews, model, and extraction prompt version. Identical evidence reuses cached features without another model call. The worker can still ingest restaurant details if the extraction key or budget is unavailable; missing evidence remains neutral.

## Verification boundary

Fixture tests verify normalizers, Actor input/request limits, privacy field stripping, paid-call retry accounting, and callback handling. They do not prove a provider run, remote SQL policy, deployment, or scheduled invocation. Those require separate live checks with credentials.
