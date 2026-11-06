# Recommendation variety and distance options

New searches rotate among up to five competitive recommendations. The candidates must be within five points of the leading personal score and in the same search relevance tier. Selection uses softmax weights with temperature 3, sampled without replacement using a hash of the search run ID and restaurant ID. Stronger matches retain better odds of appearing first.

The final ordering happens after personal feedback. Disliked restaurants cannot be promoted by exploration, lower relevance tiers retain their positions, and review-derived food scores and evidence are unchanged. The run ID is retained during polling and in saved search input, so replaying an unchanged search produces the same order. Explicit new searches and refreshes get new run IDs. Older saved searches without a run ID retain deterministic ordering until refreshed.

Options in the header controls metric or imperial distances, the default radius for new searches, and whether close matches rotate. Defaults are metric, 5 km, and variety enabled. Preferences are saved in this browser, with an explanation if storage fails. They do not sync between devices. Existing saved searches retain their own radius and variety setting; distance labels use the current unit preference.

Distance controls support metric and imperial presets, including 0.2 and 0.5 miles, plus custom decimal distances from 0.1 to 50 km (converted for imperial input). Unit changes preserve the physical radius. Invalid values show an inline error and prevent submission. Distances describe a straight-line radius, not walking distance.

For compatibility with existing retrieval limits, source and cache lookups fetch at least 500 m, then ranking enforces the precise requested circle. Searches smaller than 2 km preserve their centre to six decimal places, while wider searches retain the existing coarse coordinate handling. No database migration or extra provider request is required.

## Waterloo cache audit

Read-only audit on November 2, 2026, centred at 43.471733, -80.542175 with a 5 km radius and the default taste profile. The shared cache returned 157 records, with 108 passing the app's East Asian eligibility check. No user profiles were inspected and no paid search was started.

| Restaurant | Base score | First place in 1,000 simulated search seeds |
| --- | ---: | ---: |
| Exclamation Waterloo | 73.27 | 316 |
| Brown Donkatsu Waterloo | 72.47 | 265 |
| Home Garden Taste of Taiwan | 71.36 | 152 |
| Oka Sushi | 70.87 | 146 |
| Katsuya - Waterloo | 70.74 | 121 |

These are simulations over cached candidates, not production experiment outcomes. Actual preferences, filters, source results, and new evidence can change the cohort. If only one competitive match exists, the system keeps it first.

## Verification

The full unit and integration suite passed (315 tests), as did the existing browser suite (53 tests), TypeScript checking, and the production build. Additional browser checks covered metric defaults, invalid custom radius followed by Options and Back, custom imperial submission, saved options after reload, and mobile/desktop overflow. An independent referee reviewed the implementation and the fixes from that review.

Design references: [Google recommendation re-ranking](https://developers.google.com/machine-learning/recommendation/dnn/re-ranking), [seeded search scores in Elasticsearch](https://www.elastic.co/docs/reference/query-languages/query-dsl/query-dsl-function-score-query), and [softmax exploration in Vowpal Wabbit](https://vowpalwabbit.org/docs/vowpal_wabbit/python/latest/tutorials/python_Contextual_bandits_and_Vowpal_Wabbit.html).
