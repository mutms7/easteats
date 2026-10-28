# Homepage photo and motion demo

The homepage uses the owner's supplied 886 × 886 ramen photo at `public/images/ramen-home.png`. The original pixels are unchanged. The crop favors the bottom of the photo to bring the bowl higher into the frame. The smaller dumpling inset and relocated caption leave more of the ramen visible. On phones, the account action comes before the photo. A separate header sign-in link keeps account access visible on the first screen.

## Storyboard

1. **best eats? → east eats.** A masked slide replaces the opening phrase with the brand. The movement accelerates and settles rather than moving at a constant speed.
2. **the best east asian restaurants / DON'T HAVE / the best reviews.** The black words **the best** keep the same anchor. Five gold stars above them change to three and a half. The black restaurant phrase slides out and **reviews** replaces it. Oversized, italic red **DON'T HAVE** passes from right to left at a constant speed, without scaling or stopping. The sequence uses the owner's exact wording.
3. **Start with a favorite.** An illustrative product screen shows choosing a favorite restaurant and explaining what makes it worth returning to.
4. **Make it your taste.** Preference details show how dishes, flavors, and priorities shape the recommendations.
5. **Find your next spot.** A nearby search, restaurant list, and map demonstrate the discovery flow.
6. **tell us what you like, we'll tell you what you'll love.** The word **love** uses the logo's red, `#E12D12`. The final action opens account creation/sign-in.

## Playback and accessibility

This is a silent in-page motion piece. It starts automatically when the homepage opens and finishes on the account CTA. There are no visible play, replay, progress, duration, transcript, or demo labels. It pauses when the browser tab is hidden. Keyboard users can focus the animation and press Escape to pause or Enter to resume. Reduced-motion preferences receive the static final CTA.

The animation replaces the static hero headline, directly above Google sign-in. Its transparent background has no border or rounded player frame, so it merges into the page. Larger text gives each scene more emphasis. The animation and Google sign-in fit on the initial phone screen. The existing Plus Jakarta Sans font, white surfaces, dark text, and flame-red accent remain consistent with the app; gold identifies the star illustration.

## API use

The product examples are illustrative. Playback doesn't create an account, submit preferences, search locations, launch Apify, request map tiles, or call Claude. Only deliberately clicking the account action opens the real authentication flow.

The supplied photo's original photographer and license weren't provided, so the image credits record it as an owner-supplied asset without inventing attribution.
