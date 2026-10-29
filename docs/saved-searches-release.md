# Saved searches and restaurant feedback, October 29, 2026

The [architecture](saved-searches-architecture.md) was written before implementation. The [interface audit](saved-searches-design-audit.md) records three passes through navigation, phone/desktop layouts, and complete journeys.

## Returning to a list

Sign-in opens the most recently opened saved search. Recent search buttons and All searches replace the Fusion finds toggle. Opening history reads stored results and applies current feedback, without starting Apify, review extraction or Claude. New search opens a free draft; Start search submits it. Adjust search keeps filter changes together until one explicit submission. Refresh updates the current conversation using its applied inputs and a new source-run identity, ignoring unsubmitted drafts.

Claude makes at most one metered naming attempt per conversation after sourced results provide a city. The naming input contains recognized food/cuisine/dish facets and public restaurant cities, never the saved home address, coordinates or opinion notes. Missing credentials, failed naming or a budget limit leaves a usable deterministic title. Feedback and history reads don't need model calls.

## Cards and opinions

Cards show Food, Value, Service, Atmosphere and Taste fit in compact red number circles. Missing evidence remains Unknown. Match-reason prose and bars are removed; review sources remain in restaurant details.

Like adds a restaurant to Liked places; Dislike lowers its recommendation score. Clearing a vote restores the base score. Repeat votes don't compound. Exact Likes add four points and Dislikes subtract twenty; review-supported dish/flavor similarities have a smaller bounded adjustment. Search relevance still comes first. Opinions never change the underlying review scores or generalize a dislike to an entire cuisine. Bookmarks remain separate.

Eat here records a pending choice. The next app visit asks Like, Neutral or Dislike, with Not yet to defer. Answering records the opinion and clears the pending check-in together. Web and native clients share these account-owned endpoints and database protections.

## Database release

Three timestamp-aligned migrations were applied to East Eats, including owner-only row-level access, atomic opinion/check-in functions, a private naming-claim ledger, lightweight history counts, and historical-search restoration. Ownership is checked before paid source work starts. Late responses from an older refresh can't replace a newer snapshot.

Two existing accounts with historical discovery subscriptions received a restored latest search. The backfill changed neither source-job count (35 before and after) nor usage-ledger count (122 before and after). Empty restored lists can hydrate from their existing source job without launching a new one. The rollback-based ownership/backfill proofs passed. No new database advisor warnings were introduced. Account deletion cascades through history, opinions and meal choices.

## Verification

- Full referee: PASS, 288 unit/integration tests across 26 files, TypeScript, production Next.js build, and all 45 browser tests. No skipped journeys or added retries.
- Native: TypeScript, all seven source tests, Android JavaScript export and iOS JavaScript export passed. These aren't device tests or signed store builds.
- Real authenticated API check against the local production build and live Supabase: history restore, cross-account denial, idempotent Like, Neutral restoring the base score, pending meal answer, and account-deletion cascade passed. Two concurrent title attempts produced one real Claude request and the title “Berkeley Noodle Restaurants.” The two temporary accounts were removed afterward. No Apify run was launched for this check.
- Screenshots at 390px and 1440px were inspected. The phone's first restaurant begins above 600px. The desktop navigation no longer overlays scores. Browser fixtures intentionally omit the map key, so those screenshots don't verify real map tiles.

## GitHub and Vercel

An earlier Vercel failure was an unterminated string in the price-label helper. The upstream fix was preserved. CI now runs the complete browser suite instead of only smoke-tagged journeys, uses Node 24 and the pinned Ubuntu 24.04 runner, and retains separate native type/test/export checks. Superseded runs can still be cancelled by the existing concurrency rule; that isn't a failed verification.

Release acceptance requires both GitHub jobs to succeed and Vercel to report Ready for the production alias. The handoff links to those hosted results. Existing native signing, store and mobile MapTiler-key requirements remain in [mobile release status](../mobile/release/STATUS.md).
