# East Eats

East Asian restaurant discovery with personal taste profiles, evidence-based food ranking, fusion finds, and location search. This is a functional foundation for the incoming Claude Design handoff.

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

The three migrations in `supabase/migrations/` have been applied to the dedicated development project. A new project must apply them in order. See [the worker guide](supabase/README.md).

`refresh-worker` and `apify-webhook` are deployed. They authenticate with shared secrets, and need the following values configured under Supabase Edge Functions → Secrets before live processing: `APIFY_TOKEN`, `ANTHROPIC_API_KEY`, `ANTHROPIC_EXTRACT_MODEL`, `WORKER_SECRET`, `APIFY_WEBHOOK_SECRET`. Use the same secret values as local configuration. Built-in Supabase service credentials are available to Edge Functions.

For local processing once the server secret is present:

```sh
npm run worker:once
# or a foreground development queue loop
npm run worker
```

The website can enqueue jobs independently. Keep a worker running locally, or schedule the deployed Edge worker every minute. Hosted scheduling must use Vault for the worker secret. No schedule should contain a plaintext credential. If a launch's outcome is unknown, the reservation stays held and the job requires reconciliation rather than an automatic second paid launch.

## Behavior

Google sign-in precedes the questionnaire. Add one to five favorite restaurants anywhere, with reasons. Claude compiles hidden, validated taste weights; the app shows an editable interpretation. Location is requested when choosing nearby recommendations. Exact user coordinates aren't stored; refresh areas are rounded to two decimal places.

Restaurant order is calculated in code from food evidence, taste match, value, distance, service, and atmosphere. Google stars are displayed separately and never create a low-rating bonus. Cleanliness review concerns remain separate and visible. Missing features stay neutral with reduced confidence. Off-topic scraper results without East Asian cuisine evidence aren't included in discovery.

Cached results remain usable while bounded refreshes run. Place details expire after six hours, area discovery after24hours, and review features after seven days. Identical jobs share work. Fictional demo data never enters the live database. The explicit local demo requires `EAST_EATS_DEMO=true` and is disabled in production.

Initial database spending ceilings are $120 Apify and $40 Anthropic. Every paid job reserves budget transactionally before calling a provider. Per-run caps are enforced by Apify as well. These are application ceilings; coding/Design account usage is separate. Changes to `.env` budget values alone do not change database ceilings.

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

Google OAuth completion, hosted worker secrets, scheduled processing, full seed coverage, installed-phone behavior, and website deployment require further live verification. No hosted frontend URL is claimed yet.

## Claude Design handoff

Give the approved design to the ui agent. Preserve the current API contracts and functional flows while replacing product styles/components. The current screen styling is provisional.
