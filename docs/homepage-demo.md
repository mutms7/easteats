# Homepage photo and motion demo

The homepage uses the owner's supplied 886 × 886 ramen photo at `public/images/ramen-home.png`. The original pixels are unchanged. Next.js optimizes delivery, and the existing rounded hero frame controls the crop. The desktop dumpling inset stays in place. On phones, the account action comes before the photo. A separate header sign-in link keeps account access visible on the first screen.

## Storyboard

1. **best eats? → east eats.** A masked slide replaces the opening phrase with the brand. The movement accelerates and settles rather than moving at a constant speed.
2. **the best east asian restaurants / DON'T HAVE / the best reviews.** The black words **the best** keep the same anchor. The black restaurant phrase slides out and **reviews** replaces it. Oversized red **DON'T HAVE** carries the middle beat. The sequence uses the owner's exact wording.
3. **Start with a favorite.** An illustrative product screen shows choosing a favorite restaurant and explaining what makes it worth returning to.
4. **Make it your taste.** Preference details show how dishes, flavors, and priorities shape the recommendations.
5. **Find your next spot.** A nearby search, restaurant list, and map demonstrate the discovery flow.
6. **tell us what you like, we'll tell you what you'll love.** The word **love** uses the logo's red, `#E12D12`. The final action opens account creation/sign-in.

## Playback and accessibility

This is an in-page motion piece, not an exported video file. It stays sharp at different screen sizes and has no audio. It starts when visible, provides playback controls, and finishes on the account CTA. It pauses outside the viewport or when the browser tab is hidden. Reduced-motion preferences receive a static presentation instead of automatic movement.

The demo has its own space below the hero. It doesn't open an overlay or cover the sign-in buttons. Phone composition is taller so the text and sample screens remain readable. The existing Plus Jakarta Sans font, white surfaces, dark text, and single flame-red accent remain consistent with the app.

## API use

The product examples are illustrative. Playback doesn't create an account, submit preferences, search locations, launch Apify, request map tiles, or call Claude. Only deliberately clicking the account action opens the real authentication flow.

The supplied photo's original photographer and license weren't provided, so the image credits record it as an owner-supplied asset without inventing attribution.
