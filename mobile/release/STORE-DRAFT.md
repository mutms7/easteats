# Store listing and disclosure worksheet

Draft copy, not submitted metadata. The owner must confirm support contact, audience, privacy and data-retention answers against the deployed service.

Name: East Eats

Suggested subtitle: Find food that fits your taste

Suggested short description: Discover East Asian food through the places and flavors you already love.

Description:

Tell East Eats where you love eating and what keeps you coming back. Your favorites help shape nearby recommendations, from chewy noodles and good value to a place for date night.

Search an address or choose your current location. Explore matching restaurants on a map, read why they fit, save places for another day, and open directions when you're ready to go. Google ratings remain visible alongside the food evidence, so you can make your own call.

Restaurant details, hours, availability and review evidence can change. Missing information is shown as unavailable. East Eats does not accept restaurant orders or process food payments.

Website: https://easteats.vercel.app

Privacy: https://easteats.vercel.app/privacy

Deletion: https://easteats.vercel.app/delete-account

Support suggestion: https://github.com/mutms7/easteats/issues (verify the repository's issues are enabled). Supply a real monitored support email in store records; none is invented here.

## Data inventory to confirm in store forms

| Data | Actual use to review | Notes |
| --- | --- | --- |
| Email/account identifier and provider metadata | Authentication and account association | Supabase/Google, and Apple if enabled |
| Favorite restaurants, reasons, notes and dining priorities | Saved account preferences and personalized ranking | Notes may be sent to Claude by the server |
| Chosen coordinates or typed area | Nearby search, source jobs and geocoding | Foreground user action only; server job inputs can retain coordinates |
| Saved places | Account sync and encrypted device snapshots | Local copies clear on sign-out/deletion |
| Operational request/error metadata | Hosting, provider, queue and abuse controls | Confirm Vercel/Supabase/provider logging retention |

This inventory is not a declaration that nothing is collected or shared. Distinguish data sent to processors, account-linked data, retention, and any analytics the operator later adds. Do not claim coarse-only location when precise coordinates can be used, or claim no data collection because the app itself has no analytics SDK. No advertising or cross-app tracking feature is implemented in this native scaffold.

## Review notes to finish after testing

The app provides personalized restaurant discovery through native location/address selection, native maps, saved offline restaurant metadata, sharing and directions. Apify supplies online place/review data, Claude can interpret favorite reasons, Supabase handles authentication/storage, and MapTiler supplies maps/geocoding. Core requests use the hosted East Eats API. There are no in-app purchases or food-order payments.

Add an actual review account or another policy-compliant full-access review method, including setup instructions. Do not provide fictional working credentials or expose production API secrets. Explain how reviewers can reach account deletion from Account, and include any required Apple authentication/provider details. Final screenshots must come from the actual signed test build.
