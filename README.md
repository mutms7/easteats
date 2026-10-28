# East Eats

East Asian restaurant discovery with personal taste profiles, evidence-based food ranking, fusion finds, and location search. The responsive website also includes an installable web app shell. The native iPhone and Android client is in `mobile/`.

Production: https://easteats.vercel.app. See [the release handoff](docs/production-release.md) and [native release steps](mobile/README.md) for verification and remaining account requirements.

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

Home address, optional current location, cuisine/food filters, and evidence-backed match bars are described in [the location and food search guide](docs/location-and-food-search.md).

### Google login

In Google Auth Platform create a Web application client. Set its JavaScript origin to `http://localhost:3000`, and redirect URI to `https://zzvnwqcclfxfaghvamjv.supabase.co/auth/v1/callback`. Enter client ID and secret in Supabase Authentication → Sign In / Providers → Google. For a testing OAuth app, add the Google accounts allowed to test.

Supabase Site URL is `https://easteats.vercel.app`. Allowed callbacks include `https://easteats.vercel.app/auth/callback`, both localhost variants, and `easteats://auth/callback` for the native app. The Google client secret stays in Supabase, not the frontend.

### Database and workers

The nine migrations in `supabase/migrations/` have been applied to the dedicated development project. A new project must apply them in order. See [the worker guide](supabase/README.md).

`refresh-worker` and `apify-webhook` are deployed and configured. Their credentials are encrypted in Supabase Vault, accessible only through service-only functions. The fourth migration installs a one-minute schedule, which dispatches work only while active jobs exist. The worker returns an authenticated HTTP 202 before processing in the background. Built-in Supabase service credentials provide its bootstrap connection.

For local processing once the server secret is present:

```sh
npm run worker:once
# or a foreground development queue loop
npm run worker
```

The website can enqueue jobs independently. The hosted schedule keeps processing without the local runner. No schedule contains a plaintext credential. If a launch's outcome is unknown, the reservation stays held and the job requires reconciliation rather than an automatic second paid launch. Discovery publishes up to 20 businesses per invocation, favorites up to five. Review analysis runs as separate detail work, one restaurant per invocation. Existing and partial results stay usable.

## Behavior

Google sign-in precedes the questionnaire. Add one to five favorite restaurants anywhere, with reasons. Claude compiles hidden, validated taste weights; the app shows an editable interpretation. Location is requested when choosing nearby recommendations. Exact user coordinates aren't stored; refresh areas are rounded to two decimal places.

Every explicit favorite or discovery search starts a fresh Apify Google Maps lookup. Repeating the same search also starts a new run. Each submission carries a unique `searchId`; polling reuses that ID, including after terminal outcomes, so automatic checks cannot create duplicate paid calls. Interactive place lookups request zero reviews and publish available businesses immediately. Review enrichment follows separately. The list and map automatically append new places, fit every matching pin, and keep failed or pending searches distinct from empty results. See [the full search and map fix documentation](docs/search-and-map-fix.md).

Location search suggests actual addresses, landmarks, neighborhoods, and cities as you type, with full location labels and keyboard selection. Choosing a suggestion searches restaurants around its coordinates. Suggestions use MapTiler and only a confirmed location launches Apify. See [address search behavior and live checks](docs/location-search.md).

The questionnaire also asks what matters most: Hidden gems, Date night, Great service, Great value, or A bit of everything. These priorities change ranking weights, persist with the account, and can be edited from Taste. See [priority behavior and fallback details](docs/taste-goals.md).

Restaurant order is calculated in code from food evidence, taste match, value, distance, service, and atmosphere. Google stars are displayed separately and never create a low-rating bonus. Cleanliness review concerns remain separate and visible. Missing features stay neutral with reduced confidence. Off-topic scraper results without East Asian cuisine evidence aren't included in discovery.

Cached results remain usable while bounded searches run. Noninteractive detail maintenance uses a six-hour cache and food evidence expires after seven days. Manual search IDs bypass the old 24-hour area reuse. Fictional demo data never enters the live database. The explicit local demo requires `EAST_EATS_DEMO=true` and is disabled in production.

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
- A real authenticated search for `Pho99` in `Coquitlam` launched Apify run `YcsypKL1B3JZEdoWp`, succeeded with five source businesses and zero reviews, and returned three matching Pho 99 listings through the app API. Its verified source charge was $0.0252. The isolated acceptance account was removed afterward. `scripts/verify-favorite-live.ts` is a guarded manual check, excluded from automated paid work.

Google OAuth is enabled. The local sign-in route was verified to redirect through Supabase to `accounts.google.com` with the correct Supabase callback. A person's first Google consent and completed return session still need a manual check. Full launch-city coverage, installed-phone behavior, and website deployment require further live verification. No hosted frontend URL is claimed yet.

## Design

The shared footer identifies EastEats and its creator, William Chenyin. The public [About page](http://localhost:3000/about) explains the idea in a first-person note, including a hypothetical 3.5-star noodle shop and why food, atmosphere, and service matter differently to different people.

The homepage uses the owner's supplied ramen photo in the existing rounded frame. A silent 28-second animation opens automatically above sign-in, with word swaps, a constant-speed italic text pass, five gold stars changing to three and a half, a product walkthrough, and an account CTA. It blends into the page without player chrome. Sign-in stays visible on the first screen on phones and desktop. Keyboard pause/resume and reduced motion remain available, and playback makes no paid API calls. See [the storyboard and implementation notes](docs/homepage-demo.md).

The flow follows the supplied [Claude design](https://claude.ai/artifact/UHeVBpfJD6HdtJVUVkgbnj#page-dcb81aee8d83): login, favorite questionnaire, taste interpretation, location, list/map discovery, saved places, and restaurant details. The updated visual direction follows the user's DoorDash reference: clean geometric Plus Jakarta Sans, one vibrant flame-red accent, white surfaces, rounded controls, and real food photography. The font is bundled locally with its license. See [the research and applied design choices](docs/design-research.md) and [photo credits](public/images/credits.md). Restaurant photos come from their own source records, with an explicit missing-photo state.

The `pg_net` extension reports an advisor warning because its extension namespace is `public`. Supabase's installed extension is not relocatable. Its request tables are denied to API roles; application secrets remain behind service-only Vault functions.
