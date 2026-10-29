# Saved searches and feedback architecture

## Returning experience

After sign-in, restore the most recently opened saved search and its stored restaurant list. Opening a search never launches Apify, review extraction, or Claude. A clear New search action opens the location/search flow. Refresh is explicit and updates the current conversation with a fresh source-run ID. Query/filter submissions create new conversations, preserving earlier lists.

Replace the For you/Fusion finds toggle with a Your searches row: the current search, a few recent named searches, a complete history chooser, and New search. On phones, keep the row scrollable and avoid nesting navigation inside restaurant cards. Keep restaurant filters grouped below the current search heading. Saved bookmarks and Liked places have separate labels.

## Storage and endpoints

All new tables are account-owned, protected by row-level security, and cascade when an account is deleted.

- `search_conversations`: UUID, user ID, title and one-time naming status, validated search input/area label, stored result snapshot, created/updated/last-opened timestamps. The server builds snapshots from discovery responses, not client-submitted restaurant claims. GET `/api/searches` lists summaries; GET `/api/searches/[id]` opens stored results with current feedback applied. Discovery accepts optional `savedSearchId` and `areaLabel`; run `searchId` still identifies only paid work. Refresh retains the conversation ID.
- `restaurant_feedback`: one current like/dislike/neutral vote per account and restaurant. GET/PUT `/api/feedback` reads or updates it. Sending null clears a vote. Likes become the Liked places collection. Repeat votes are idempotent and never compound preference weights.
- `meal_checkins`: one current choice per account, restaurant ID, optional owned search ID, chosen time and answer time. PUT `/api/meal` chooses a place. GET returns a pending check-in. On the next application visit, ask Like/Neutral/Dislike, or Not yet. Submitting an opinion saves feedback and marks the check-in answered.

## Costs and personalization

Claude names a conversation at most once after real results provide a city. Use the existing metered Haiku integration, a small output limit and an atomic naming claim. Pass food/filter inputs and public restaurant city names, never a saved street address. Missing credentials, provider failure, or budget limits keep a deterministic title and usable search. Failed naming isn't retried on every poll.

Feedback applies a bounded, deterministic adjustment to the existing ranking. Exact dislikes lower that restaurant; related dish/flavor affinities have a smaller, evidence-dependent influence. Neutral doesn't create a preference. Base questionnaire weights aren't rewritten on every click. Search relevance still precedes personalization, and user feedback doesn't fabricate food/service scores.

## Restaurant cards

Remove Why this place, prose match reasons and score sliders. Show five compact labeled scores: Food, Value, Service, Atmosphere, Taste fit. Known numbers sit in small red circles with an out-of-100 label; missing evidence stays Unknown. Keep Like, Dislike, Save and Eat here actions distinct. Details may retain source evidence, separate from the compact card scores.

## Verification and design audits

Check privacy and ownership, one naming attempt, opening/history restoration without paid work, refresh identity, idempotent feedback, neutral handling, post-meal timing, and stale-response isolation. Audit the interface in three passes: navigation and hierarchy; phone/desktop layout and keyboard access; full return/search/choose/rate journeys. Run the full referee suite and native exports, then verify the final GitHub checks and Vercel deployment. Publish a single reviewed release instead of pushing intermediate broken states.
