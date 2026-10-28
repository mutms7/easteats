# Home location, food search, and match explanations

## What was wrong

The old discovery endpoint trusted Google Maps result membership. Once a place appeared in the scraper's results, it bypassed the app's text matching. Maps can return adjacent categories, so a search for noodles could include restaurants without noodle evidence. Cached searches used a different, literal substring check. Food groups and cuisine labels also weren't separate fields.

## Location behavior

The questionnaire now includes an optional Home address editor. Choose an actual address suggestion and press Save home address. Change and Clear are explicit actions. The saved label and coordinates live in an account-owned `location_preferences` row, separate from favorites and Claude taste inputs. Responses are private and aren't cached by the service worker. Account deletion cascades to the saved home address.

Returning users with a completed profile and home address get one initial nearby search around home. Completing the questionnaire uses home as the default starting point. Search text and filter changes keep the active location. Choosing another area or pressing Use my current location overrides home for that visit; it doesn't overwrite the saved address. Reloading returns to saved home. Saving an address alone doesn't launch Apify.

GPS is optional and requested on the button press, with permission denial and stale callbacks handled. No background location tracking is added. Home edits don't replace a manually selected visit location. Web and native clients share this behavior and the authenticated `/api/location` endpoint.

## Search behavior

Food type and Cuisine are separate visible controls. Food types include sushi, noodles, hot pot, rice, dumplings, BBQ, fried chicken, seafood, soup, desserts, and bubble tea. Cuisines include Chinese, Korean, Japanese, Vietnamese, Thai, Taiwanese, Mongolian, Tibetan, and Fusion. A cuisine never implies that every dish is served there.

New Apify records preserve original listing categories and add canonical food types and cuisines. Extracted food tags require source-backed positive serving evidence. Old cached records are classified at read time, so existing data can improve without a paid bulk scrape. A specific dish's cultural origin doesn't automatically become the venue's cuisine label.

Every result, including a newly scraped one, must satisfy the recognized query and selected facets. `noodles` can match ramen, pho, udon, and other supported noodle aliases. `ramen` needs ramen evidence and won't match pho merely because both are noodles. `Korean noodles` requires both. `beef noodles` checks the modifier against listing/dish/review text. `Pho99` preserves the numeric name constraint. Matching handles normalization, plurals, bounded multilingual aliases, and unambiguous single-edit food-word typos.

An explicit food search ranks matches identified in a name or listing category ahead of matches supported only by review mentions. Personal taste ordering remains within those relevance tiers. Browse ordering stays personalized. This makes noodle listings easier to find without claiming that every restaurant mentioning noodles specializes in them.

Each submitted search still creates one fresh Apify search identity. Polling reuses it. The provider query includes the typed search, cuisine, and food filter, with existing limits on query length, source count, spending, and refresh frequency. Selecting an address to save or typing autocomplete text doesn't launch an actor. Unclassified places stay out of strict dish results until supporting detail arrives; the interface explains when review updates may add matches.

## Why this place

Cards and details replace Strong fit and the repeated generic sentence with specific preference overlaps, listing matches, and short review excerpts. Review signals show Food, Value, Service, Atmosphere, and Taste fit as read-only bars. They aren't editable preferences, Google stars, guaranteed quality measurements, or match probabilities.

Food/value/service/atmosphere signals come from the existing review sentiment aggregation, shrunk toward neutral when observations are sparse, then scaled to 100. A displayed aspect also needs linked evidence and nonzero confidence. Taste fit needs review-supported comparisons to stated preferences. Missing or unsupported signals show Unknown, not a fabricated 50. Actual supported zero values remain zero. Analyzed review counts and evidence strength appear alongside the bars, with review source links in restaurant details.

## Research behind the change

[DoorDash's retrieval engineering](https://careersatdoordash.com/blog/how-doordash-leverages-llms-for-better-search-retrieval/) separates understanding a query, annotating restaurant/item data, retrieving candidates, and enforcing constraints. EastEats now applies the same separation on a smaller scale instead of letting personalization override relevance.

[Uber Eats' query-understanding article](https://www.uber.com/gb/en/blog/uber-eats-query-understanding/) distinguishes restaurants, cuisines, and dish types and explains hierarchical query expansion. That informed the difference between a broad noodles search and a specific ramen search. [Google's place types](https://developers.google.com/maps/documentation/places/web-service/place-types) likewise distinguish cuisine and dish-oriented categories. [Apify's scraper documentation](https://apify.com/compass/crawler-google-places) describes the source categories and warns that search results can contain false positives.

## Checks and limits

The final local referee passed 243 unit/integration tests, TypeScript, a production build, and 35 browser tests. Both native platform bundles and the native type/source checks also passed.

Tests cover category parsing, food/cuisine separation, specific dishes, multilingual names, typo and mixed-query matching, irrelevant sourced hits, relevance ordering, read-only/unknown scores, saved-home privacy, current-location overrides, reloads, keyboard access, and phone layout. A transactional database check proves owner-only reads/updates/deletes and cascading deletion, then rolls back all synthetic records.

An existing ten-place Apify dataset was re-read and normalized without launching a new actor. Mitama retained Japanese/Sushi listing evidence; Noodle Dynasty retained its Chinese noodle category; an Indian-only listing wasn't relabeled East Asian. A separate read of 65 eligible cached restaurants confirmed noodle and Pho99 matches. These checks don't prove complete menus or current restaurant offerings.

This is a curated taxonomy and conservative phrase matcher, not unlimited natural-language search. Unknown dishes, missing source categories, and comparison/negation phrasing can still reduce recall. There is no automatic widening to unrelated food. The website's MapTiler address and tile checks now return 200 for its production origin. The existing native map key still rejects requests without an Origin, so native tile access needs a supported mobile key configuration before store release.
