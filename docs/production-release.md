# EastEats release handoff, October 28, 2026

Production address: https://easteats.vercel.app. Vercel deployment `dpl_3sXkUvGDRFRxFv6yeor9G1QD8yws` reported READY and assigned this production alias.

## What changed

The questionnaire now offers five priorities: Hidden gems, Date night, Great service, Great value, and A bit of everything. Great value increases the weight of review-derived value evidence. A cheap price bracket alone doesn't earn a ranking bonus. Selecting a card doesn't start a paid request; saving preferences uses the existing Claude request.

`mobile/` contains the native Expo/React Native application for iPhone and Android, using the existing production API and Supabase accounts. It includes sign-in, favorite searches and reasons, editable priorities, nearby discovery, address suggestions, list/map views, saved restaurants, directions, sharing, and account deletion. Native requests verify the user's bearer token on the server and keep database access scoped to that user.

The website includes public privacy and account deletion pages at `/privacy` and `/delete-account`. Deletion requires explicit confirmation, revokes refresh sessions, and deletes only the authenticated account. Account-owned preferences, saves, and search subscriptions cascade away. Shared restaurant listings remain. Failed revocation stops deletion; failed deletion is reported as a failure.

## Hosting and secrets

The Vercel project is `easteats` in `william-chenyins-projects`, connected to `mutms7/easteats`. Production uses Node 24, `npm ci`, and `npm run build`. Server credentials are configured in production environment settings; none belong in the public repository or native bundle. The website receives its Supabase credentials, Claude taste credentials, worker dispatch secret, and public MapTiler key. Apify and review-analysis credentials remain in the existing Supabase worker configuration.

Supabase Site URL is `https://easteats.vercel.app`. Allowed callbacks include its `/auth/callback`, localhost callbacks, and `easteats://auth/callback`. Google provider settings are preserved. Native Apple sign-in remains gated until Apple credentials and the Supabase Apple provider are configured.

## Provider restrictions, updated after the location/search changes

The website MapTiler key now returns HTTP 200 for both geocoding and map styles with the production origin. A native-style map request without an Origin still returns 403. The available browser session isn't signed into MapTiler, so native key configuration remains an owner action.

In MapTiler Cloud, open Account → API keys and authorize `https://easteats.vercel.app` for the website's key, preserving localhost for development. Configure a separate key suitable for native use according to MapTiler's supported application restrictions. Don't spoof request origins or remove all restrictions as a workaround. If the website key value changes, update `NEXT_PUBLIC_MAPTILER_KEY` in Vercel Production and redeploy; native builds use `EXPO_PUBLIC_MAPTILER_KEY`.

Website address suggestions and tiles are now accepted by the provider. Native tiles still need a supported mobile key. Provider checks don't constitute a real device or production sign-in acceptance test. See [the location/search update](location-and-food-search.md) for saved-home behavior and query matching.

## Native release status

Native TypeScript, source tests, Expo Doctor, JavaScript exports for both platforms, and Android project generation are local preparation checks. They aren't signed store binaries or device tests. Expo/EAS isn't signed in on this machine. iOS native generation requires macOS or an EAS build. Apple Developer and Google Play access, app registrations, signing credentials, store metadata, review declarations, and real-device acceptance are still required. See `mobile/README.md` for exact commands and the store checklist.

The existing PWA can be installed through a supported mobile browser once hosted. This is separate from App Store and Google Play distribution.

## Verification

The referee passed 185 unit/integration tests, TypeScript, a production website build, and 30 fixture-based browser journeys. Account tests cover confirmation, authorization, origin checks, revocation failure, deletion failure, and closed login redirects. Mobile CI independently checks types, source tests, and both platform exports. No automated fixture test proves Google consent, store review approval, live restaurant availability, or a working MapTiler production allowlist.

Vercel uses [Standard Protection](https://vercel.com/docs/deployment-protection), protecting preview/generated deployment URLs while keeping the production domain public. Deployment completion and configuration were checked through Vercel's CLI/API. The deployed website wasn't fetched as a live browser acceptance check.
