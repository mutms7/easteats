# East Eats

East Asian restaurant discovery with personal taste profiles, evidence-based food ranking, fusion finds, and location search. The responsive website also includes an installable web app shell.

## Run locally

Requires Node.js24 and npm. Clone this repository, then:

```sh
npm ci
cp .env.example .env.local
npm run setup:check
npm run dev
```

Open http://localhost:3000. Fill local credentials before using live services. `.env.local`, provider results, and referee logs are ignored by Git. Never commit them.

The dedicated development Supabase project is `zzvnwqcclfxfaghvamjv` in `us-west-1`. The previous GoodLife.AI project was paused, not deleted. Its data was preserved.

## Credentials

| Local variable | Where it comes from |
| --- | --- |
| NEXT_PUBLIC_SUPABASE_URL | Supabase project connection settings |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | Supabase Settings → API Keys → publishable key |
| SUPABASE_SECRET_KEY | Supabase Settings → API Keys → secret key, server only |
| APIFY_TOKEN | Apify Console → Settings → API & Integrations |
| ANTHROPIC_API_KEY | Claude Console → API keys |
| NEXT_PUBLIC_MAPTILER_KEY | Optional MapTiler key for embedded maps and general area geocoding |
| WORKER_SECRET / APIFY_WEBHOOK_SECRET | Generated locally by npm run setup:check |

MapTiler draws the map; Apify collects restaurant data. Without MapTiler, use location coordinates or the three launch-city shortcuts. Google Maps directions still work.

### Google login

In Google Auth Platform create a Web application client. Set its JavaScript origin to `http://localhost:3000`, and redirect URI to `https://zzvnwqcclfxfaghvamjv.supabase.co/auth/v1/callback`. Enter client ID and secret in Supabase Authentication → Sign In / Providers → Google. For a testing OAuth app, add the Google accounts allowed to test.

In Supabase URL Configuration set Site URL to `http://localhost:3000` and allow `http://localhost:3000/auth/callback`. Add the deployed app's origin and callback when hosting is configured. The Google client secret stays in Supabase, not the frontend.

### Database and workers

The five migrations in `supabase/migrations/` have been applied to the dedicated development project. A new project must apply them in order. See [the worker guide](supabase/README.md).

`refresh-worker` and `apify-webhook` are deployed and configured. Their credentials are encrypted in Supabase Vault, accessible only through service-only functions. The fourth migration installs a one-minute schedule, which dispatches work only while active jobs exist. The worker returns an authenticated HTTP 202 before processing in the background. Built-in Supabase service credentials provide its bootstrap connection.

For local processing once the server secret is present:

```sh
npm run worker:once
# or a foreground development queue loop
npm run worker
```

The website can enqueue jobs independently. The hosted schedule keeps processing without the local runner. No schedule contains a plaintext credential. If a launch's outcome is unknown, the reservation stays held and the job requires reconciliation rather than an automatic second paid launch. Each invocation enriches one restaurant, so a full result set can take several minutes. Existing and partial results stay usable.

## Behavior

Google sign-in precedes the questionnaire. Add one to five favorite restaurants anywhere, with reasons. Claude compiles hidden, validated taste weights; the app shows an editable interpretation. Location is requested when choosing nearby recommendations. Exact user coordinates aren't stored; refresh areas are rounded to two decimal places.

Restaurant order is calculated in code from food evidence, taste match, value, distance, service, and atmosphere. Google stars are displayed separately and never create a low-rating bonus. Cleanliness review concerns remain separate and visible. Missing features stay neutral with reduced confidence. Off-topic scraper results without East Asian cuisine evidence aren't included in discovery.

Cached results remain usable while bounded refreshes run. Place details expire after six hours, area discovery after24hours, and review features after seven days. Identical jobs share work. Fictional demo data never enters the live database. The explicit local demo requires `EAST_EATS_DEMO=true` and is disabled in production.

Initial database spending ceilings are $120 Apify and $40 Anthropic. Every paid job reserves budget transactionally before calling a provider. Per-run caps are enforced by Apify as well. Review extraction uses up to eight batches of five reviews, with two concurrent requests and a 25-second timeout per request. It settles the full combined charge only after every batch finishes; unknown partial outcomes keep their reservation. These are application ceilings; coding/Design account usage is separate. Changes to `.env` budget values alone do not change database ceilings.

## Verification

```sh
npm test
npm run typecheck
npx playwright install chromium
npm run verify:integration
npm run secrets:check
```

The automated browser journey uses clearly labeled fictional fixtures. It verifies the login gate, questionnaire, reload, discovery, fusion filter, save/remove, details, and logout. It does not substitute for Google OAuth or paid-provider smoke testing.

`referree.sh` is the Claude Code Stop/SubagentStop judge. It delegates to a bounded Node runner and returns exit2 on failed proof, at most five times per session/agent/worktree. The sixth failure reports EXHAUSTED and permits stopping without declaring success. Set the Bash executable path in `.claude/settings.json` for non-Windows machines. Separate data/taste/ui agent definitions are included; the lead plus three helpers is the maximum team size.

## Verified live so far

- A ten-place Berkeley Apify pilot succeeded, costing $0.0302.
- The records were imported into the dedicated project, with reviewer personal fields removed.
- A real Claude taste interpretation and five-review evidence extraction passed, costing $0.0064682 combined.
- Rollback-only database checks passed profile isolation, ownership protection, and rejection of direct authenticated access to spending RPCs.
- Authenticated API checks passed session verification, real Claude personalization, cached favorite search, nearby ranking, idempotent saved places, and MapTiler geocoding. The isolated test account was removed afterward.
- The hosted worker returns 401 without authentication and 202 with its shared secret. Scheduled processing has successfully extracted and stored full review evidence from the existing live Apify run.

Google OAuth is enabled. The local sign-in route was verified to redirect through Supabase to `accounts.google.com` with the correct Supabase callback. A person's first Google consent and completed return session still need a manual check. Full launch-city coverage, installed-phone behavior, and website deployment require further live verification. No hosted frontend URL is claimed yet.

## Design

The flow follows the supplied [Claude design](https://claude.ai/artifact/UHeVBpfJD6HdtJVUVkgbnj#page-dcb81aee8d83): login, favorite questionnaire, taste interpretation, location, list/map discovery, saved places, and restaurant details. The updated visual direction follows the user's DoorDash reference: clean geometric Plus Jakarta Sans, one vibrant flame-red accent, white surfaces, rounded controls, and real food photography. The font is bundled locally with its license. See [the research and applied design choices](docs/design-research.md) and [photo credits](public/images/credits.md). Restaurant photos come from their own source records, with an explicit missing-photo state.

The `pg_net` extension reports an advisor warning because its extension namespace is `public`. Supabase's installed extension is not relocatable. Its request tables are denied to API roles; application secrets remain behind service-only Vault functions.
