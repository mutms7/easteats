# Food discovery design research

Reviewed October 25, 2026. This pass follows the request for DoorDash-like typography, one vibrant brand color, and real photographs. It supersedes the earlier illustrated field-guide styling while preserving the approved product flow.

## References and findings

### DoorDash

I inspected the [current consumer homepage](https://www.doordash.com/) in a browser. Its hero uses a heavy, compact geometric headline, red actions, rounded controls, white surfaces, and large food photography. The rendered hero font was `TTNormsProCond-Blk`; a separate [case study by DoorDash's design partner Base](https://www.basedesign.com/projects/dashpass-by-doordash) identifies TT Norms in DoorDash's typographic system.

[DoorDash's Prism engineering article](https://careersatdoordash.com/blog/design-language-system-theming/) describes sharing color, typography, spacing, and component definitions across web, iOS, and Android, with semantic values mapped to underlying tokens. The practical lesson here is consistency: the same action, selection, and focus states should read the same way throughout East Eats.

DoorDash's [menu-photo guidance](https://help.doordash.com/en-us/merchants/article/common-rejection-reasons) favors clear, representative food, natural backgrounds, sensible framing, and images without decorative overlays. East Eats applies that to sourced restaurant photographs. The login photography is inspiration, not evidence about a listed restaurant.

### Uber Eats

I inspected the [current Uber Eats homepage](https://www.ubereats.com/) in a browser. It puts a direct task, large heading, and clear controls against prominent food photography. The rendered headline uses UberMove at 52px and weight 700 on desktop. The interface around the photograph is restrained, giving the food most of the visual interest.

Its [user-photo guidance](https://help.uber.com/ubereats/restaurants/article/user-submitted-photo-guidelines?nodeId=d6cfd615-27ac-4f87-b4c6-b1785333e6e7) recommends natural light, clear portions, and authentic photography. East Eats uses real camera photographs and keeps missing restaurant imagery explicit.

### Deliveroo

The [current Deliveroo homepage](https://deliveroo.co.uk/) gives its location search a clear place in the hierarchy. Its [image guidance](https://help.deliveroo.com/en/articles/3295699-how-to-upload-your-own-photos-in-menu-manager) recommends centering the main food content so crops work across app placements. [Otherway's first-hand Deliveroo Hop case study](https://www.otherway.com/work/deliveroo-hop) explains using familiar brand colors with candid product photography. East Eats borrows the consistency and responsive framing, while retaining its own color and login-first flow.

## Applied choices

- **Type:** Plus Jakarta Sans, locally bundled, with 700/800 headings and 400/500 body text. This is an open-license geometric alternative with a similar clear, friendly character. It is not DoorDash's proprietary font. One family replaces the display/body/monospace combination.
- **Color:** flame red `#E12D12`, used for the wordmark accent, primary actions, selected controls, focus, map pins, and installed-app theme. Darker hover values and pale red surfaces stay within the same hue. White, near-black, and gray form the rest of the interface. White on the primary red has approximately 4.58:1 contrast.
- **Hierarchy:** a concise headline and Google sign-in on the login screen; favorite search and reasons next; then nearby results. The restaurant list gives photo, name, fit explanation, price, distance, and labeled Google rating clear places.
- **Controls:** rounded buttons and chips, visible selected states, at least 44px touch targets, and keyboard focus. Consistent spacing and quiet borders keep the interface easy to scan on desktop and phone.
- **Photography:** real ramen and dumpling photographs replace the generated food drawings. Restaurant cards continue to use only their own source images. No stock photograph is attached to a real restaurant as if it showed that restaurant's food.
- **Restraint:** no mustard tape, ruled paper, rotated photo frames, decorative hard shadows, or competing leaf-green/yellow brand accents. Photography supplies the variety.

## Photo provenance

See [the asset credits](../public/images/credits.md). Both inspiration images have public photographer attribution, camera metadata, and an Unsplash license. The photographs predate this redesign; they were not generated for East Eats.
