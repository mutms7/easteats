# Account access and compact search, November 1, 2026

Account is available in the header as soon as someone signs in, including before onboarding and before a new search. It contains editable name and email, the saved home address, taste preferences, sign-out, and the existing account deletion link. Email changes use Supabase's authenticated update flow and require confirmation. Google sign-in remains linked to the Google identity. Demo identity details are read-only.

Onboarding asks for an optional home address before the taste priority cards. A selected address is explicitly saved to the existing private location preferences table. No database migration is needed. Every New search uses that account's saved home, even after searching somewhere else. Focusing the prefilled home clears only the search field and its coordinates, without deleting the account setting. Use saved home restores it. An address typed for a visit doesn't replace the saved home.

The search screen now groups the address, current location, food query, four filters, and Start search in one compact area. The oversized heading and redundant instructions are removed. Current location is white, Find area is red, and both sit next to the address on desktop or immediately below it on phones. Find area resolves an address; Start search submits the restaurant search. The selected address and coordinates stay aligned after GPS, manual selection, home changes, and trips to Account.

Every returned saved search appears in one horizontal strip. The separate All searches disclosure and five-item strip cap are removed. The strip supports touch scrolling, a native scrollbar, and keyboard focus. New search has secondary styling. Sign-out moved into Account.

Search controls fit at 375x812, 390x844, and 1440x900 with normal text and fixture history. Smaller screens, long content, validation messages, suggestions, and enlarged text can scroll. The design doesn't crop content or disable zoom to enforce a fixed screen height. This follows the accessibility principle in [WCAG's Reflow guidance](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html).

## Verification

- 295 unit and integration tests passed, including current-account-only profile updates, input validation, pending email handling, authentication, origin checks, and provider failures.
- All 45 existing browser journeys and eight account/search browser tests passed. Coverage includes account editing before onboarding/search, failed-save drafts, home changes, per-search reset, keyboard history access beyond five items, small screens, enlarged text, GPS races, and stale history responses.
- TypeScript, production build, and the secret scan passed.
- The local production build was exercised against the real Supabase service with an isolated temporary account. A name and home address were saved through the authenticated API, read back through Supabase, restored after browser reload, and cleared. The temporary account was removed. Address suggestions were fixtures for this check; no paid search or model calls were made.
- Email confirmation delivery and Google consent weren't exercised in the real-service check. Email update success/failure and pending confirmation behavior are covered by API tests. Deployment readiness and production alias assignment are checked through Vercel's deployment metadata.

The repeatable real-service check is `node --import tsx scripts/verify-account-live.ts`, against a running local production build at port 3200 with the ignored production environment file. It creates and cleans up only its own acceptance account and writes evidence under the ignored `.local/` directory.
