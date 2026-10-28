# Release status, checked October 28, 2026

## Prepared and checked

- Native source and public configuration for iOS and Android, with separate dependency lockfile and proposed identifier `com.easteats.app`.
- Existing vector logo converted to an opaque 1024px store icon and transparent Android adaptive foreground.
- Foreground location only. No background location, photo library, microphone, overlay, or storage permission is required for restaurant discovery.
- System-browser Google PKCE, encrypted session/draft/saved storage, native Apple sign-in code gated on actual provider setup, bearer API calls and destructive account deletion confirmation.
- Typecheck, six native source tests, Expo Doctor (20/20), Android project generation, and Android/iOS JavaScript exports passed during preparation. Re-run these after changes. No native app was launched on a device or simulator.

## Exact blockers before store release

1. **Expo/EAS account:** both local Expo and EAS account checks returned `Not logged in`. The app is not linked to an EAS project. The owner needs to sign in, choose the account/organization, run `eas init`, and set the resulting project ID and build environment variables. No account enrollment, cloud build or purchase was performed.
2. **Store accounts/signing:** Apple Developer Program membership, Apple team, App Store Connect app record, Play Console developer account, app records, certificates/profiles and Play App Signing setup are not available. Identifier availability is not verified. Store submission also needs a real support contact, screenshots and final metadata.
3. **Build host/device:** this host is Windows. Expo explicitly refused iOS native project generation here. iOS compilation requires macOS with an eligible Xcode or EAS. Android project generation succeeded, but an Android SDK/device/adb was not available in PATH, so no APK/AAB was compiled or installed. The generated projects are reproducible from the checked-in config rather than committed native output.
4. **MapTiler restrictions:** website geocoding and styles now accept the production origin (HTTP 200). Native-style map requests without an Origin header still return HTTP 403. The owner must provision a native-compatible MapTiler key using supported restrictions. Do not bypass the key's restrictions or make it unrestricted. Native source shows a truthful map-unavailable state and keeps the matching list available. Address search also depends on the server's MapTiler configuration. Check [MapTiler key protection](https://docs.maptiler.com/guides/maps-apis/maps-platform/how-to-protect-your-map-key/) and its mobile SDK guidance with the account owner before changing restrictions.
5. **Sign in with Apple setup:** native code exists but `EXPO_PUBLIC_APPLE_AUTH_ENABLED=false`. Before the iOS store build, enable Sign in with Apple for the registered app identifier, add `com.easteats.app` to the Supabase Apple provider Client IDs, configure/test that provider, then enable the public flag. Google-only consumer account sign-in must meet Apple's equivalent-login requirement. Test Apple account deletion and any required provider-token revocation before enabling Apple in production.
6. **Device QA and disclosures:** complete the device checklist, final privacy/data-safety forms, age rating, review access and metadata. Public privacy/deletion pages and production APIs must be deployed and tested. The owner must confirm the app's real data retention/support practices and review any dependency audit findings before signing.
7. **Dependency audit:** the current Expo/MapLibre toolchain install reports nine npm advisories (six low, three high), primarily transitive build/config dependencies. `npm audit` proposes an incompatible Expo SDK downgrade for some issues, which was not applied. This is not a clean dependency audit. Review the exact lockfile report and upstream fixes before a production build. Do not use `npm audit fix --force` to silently downgrade the SDK.

## Current official platform requirements

Apple requires useful app-specific functionality beyond a repackaged website. This client provides native location, map interaction, saved offline access, sharing and directions, but approval is still Apple's decision. See [App Review Guidelines 4.2, 4.8 and 5.1.1](https://developer.apple.com/app-store/review/guidelines/).

Apple's April 28, 2026 submission requirement is iOS 26 SDK or later. Expo SDK 58's supported toolchain uses Xcode 26.4 or later. Use an eligible current EAS image or local Xcode and inspect the actual build output, rather than assuming an old local Xcode qualifies. Sources: [Apple SDK requirements](https://developer.apple.com/news/?id=ueeok6yw), [Expo SDK compatibility table](https://docs.expo.dev/versions/v58.0.0/).

For Google Play new apps/updates, the current requirement is Android 16 / API 36 or higher. SDK 58 currently targets API 36. Check the compiled bundle and current policy again when uploading. Source: [Google Play target API requirements](https://support.google.com/googleplay/android-developer/answer/11926878).

Both stores require an in-app account-deletion path for apps that create accounts. Google also requires a working public web deletion resource. New Google Play personal accounts created after November 13, 2023 need a closed test with at least 12 continuously opted-in testers for 14 days before applying for production access. Sources: [Google account deletion](https://support.google.com/googleplay/android-developer/answer/13327111), [personal-account testing](https://support.google.com/googleplay/android-developer/answer/14151465).

MapLibre v11 requires React Native 0.80+ and the New Architecture; it provides an Expo config plugin and is not included in Expo Go. SDK 58/RN 0.88 meet its stated baseline. Actual native integration still needs device testing. Sources: [MapLibre requirements](https://maplibre.org/maplibre-react-native/docs/setup/getting-started/), [Expo setup](https://maplibre.org/maplibre-react-native/docs/setup/expo/).

Native OAuth follows [Supabase's mobile deep-linking guidance](https://supabase.com/docs/guides/auth/native-mobile-deep-linking) and [Expo's authentication guidance](https://docs.expo.dev/develop/authentication/). A verified universal/app link is preferable for a future production domain setup. The current custom-scheme callback exchanges only a PKCE code, not tokens. Do not add a fake Apple team ID or signing certificate fingerprint to an association file.
