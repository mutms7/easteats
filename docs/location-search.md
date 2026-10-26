# Address and area search

Location search now suggests street addresses, landmarks, neighborhoods, and cities while you type. The same control appears during location setup and when you choose **Change area**. It shows a street or place name above its city, province, postal code, and country when the provider supplies them.

Type at least three characters, then choose a suggestion. You can use the arrow keys and Enter, or tap a result. Escape closes the suggestions and the clear button resets the field. **Find area** also runs the lookup immediately, but never silently selects the first result. The current-location button still asks for location permission only when you press it.

## What changed

The old form waited for a submit, returned plain area labels, and intercepted some city searches with hardcoded California coordinates. The new live endpoint always uses MapTiler, includes address and point-of-interest searches, returns structured labels, and validates coordinates before showing results. Demo city fixtures remain confined to demo mode.

The browser waits 300 ms after typing stops. It cancels obsolete requests and ignores late responses, so an earlier query can't replace the suggestions for your latest input. Loading, no matches, and connection failures appear beside the field, with an immediate retry through **Find area**. Keyboard focus stays in the input while navigating its accessible list of options.

The location screen keeps suggestions in the page flow and hides the bottom navigation so it can't cover an address. If you've already chosen an area, **Back to results** returns to it. A pending GPS response can't replace a manually chosen address or launch another restaurant search afterward.

Once you've selected a location, the next lookup uses those coordinates as a proximity preference. This favors nearby suggestions without restricting you to that city. Explicit city and street terms still matter to relevance. No background GPS request or server-IP location guess is used.

Typing only calls `/api/geocode`, which uses the existing MapTiler key. Choosing a suggestion passes its actual coordinates into the existing restaurant discovery flow and creates a fresh search ID. That's when Apify searches Google Maps. Address suggestions don't launch Apify or Claude jobs. Their requests count toward your MapTiler usage.

## Live address checks

Using the configured MapTiler connection, these public addresses returned actual address features:

| Query | Returned address | Latitude, longitude |
| --- | --- | --- |
| `200 University Ave W Waterloo` | 200 University Avenue West, Waterloo, Ontario N2L 3G1 | 43.471733, -80.542175 |
| `2991 Lougheed Hwy Coquitlam` | 2991 Lougheed Highway, Coquitlam, British Columbia V3B 6J6 | 49.276248, -122.795030 |
| `University of Waterloo` | University of Waterloo, Waterloo, Ontario (landmark) | 43.470199, -80.545243 |

Results can include multiple postal-code or location variants for a street address. East Eats keeps the provider's labels and coordinates rather than constructing a guessed house number. A street or area match is identified as such; it isn't an exact building address. Coverage and accuracy depend on MapTiler's data. This is a nearby-food search, so unit numbers and delivery instructions aren't requested.

## Reference patterns

[Google's autocomplete documentation](https://developers.google.com/maps/documentation/places/web-service/place-autocomplete) uses separate main and secondary location text and distinguishes a proximity preference from a geographic restriction. [DoorDash's consumer guide](https://help.doordash.com/en-us/consumers/article/is-doordash-available-in-my-city) starts restaurant discovery from an entered address. Its [address autocomplete API](https://developer.doordash.com/en-US/api/drive/#tag/Address) also accepts partial text and optional coordinates. These informed the interaction, while [MapTiler's search API](https://docs.maptiler.com/cloud/api/geocoding/) supplies East Eats' location suggestions.

Automated coverage includes debounce timing, full-address display, keyboard selection, stale responses, cancellation, clear and Escape, empty results and retry, mobile tapping and layout, coordinate handoff, a new restaurant search ID after changing locations, and late GPS success or failure after manual selection. Browser fixtures don't spend provider credits.
