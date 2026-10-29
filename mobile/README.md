# East Eats for iPhone and Android

This directory contains a native Expo SDK 58 / React Native 0.88 client. It is not a WebView wrapper. It uses the production web service at `https://easteats.vercel.app` for authenticated APIs, source jobs and recommendation logic.

Implemented native screens: Google system-browser sign-in, optional native Sign in with Apple, favorites and reasons, five dining priorities, interpreted tastes and corrections, address selection, explicit foreground GPS, progressive discovery, list/map, saved places, encrypted saved offline snapshots, native sharing/directions, and account deletion confirmation. Photos are supplied by real restaurant data; missing photos are labeled. MapLibre uses the same MapTiler service as the website. No Apify or Anthropic key is included in the app.

This is release preparation, not a published or device-verified app. Read [release/STATUS.md](release/STATUS.md) before building or submitting.

The native client also restores the most recently opened account search without starting discovery, shows recent search buttons and an expanded history chooser, and keeps draft filters free until Start search or Search with these options. Refresh uses the applied filters and the existing conversation. Restaurant cards have five score circles, Like/Dislike, bookmarks and Eat here. A pending meal opinion appears on the next app visit. Liked places stay separate from bookmarks. These flows use the same private `/api/searches`, `/api/feedback` and `/api/meal` endpoints as the website. The offline Saved snapshot remains separate from account search history.

## Run locally

Use Node 24 (Expo SDK 58 requires at least Node 22.13). First install web dependencies from the repository root, then install the native package:

```sh
npm ci
cd mobile
npm ci
```

Native contract imports are type-only, but local TypeScript checks and the shared-goal contract test also read the root source tree and its Zod types. Root dependencies are therefore needed for these development checks. Root runtime packages are not bundled. The native app shares the dependency-free taxonomy and review-insight helpers in `src/lib/` through its scoped Metro configuration, so cuisine/food labels and unknown-evidence behavior stay aligned. Run the remaining commands from `mobile/`.

Copy `.env.example` to `.env` and set only the public Supabase URL, publishable key, API origin and MapTiler key. If the web repository already has its public variables in `.env.local`, the following copies only the allowed public fields into a new ignored mobile env file. It refuses to overwrite an existing file:

```sh
node scripts/configure-from-web.mjs
npm run typecheck
npm test
npx expo-doctor
```

The native callback is exactly `easteats://auth/callback`. It must be allowlisted in the same Supabase project as the website. The app uses PKCE with a verifier stored in encrypted SecureStore. Google sign-in opens the system browser. Do not use the browser website's cookie flow inside an embedded WebView.

MapLibre requires a development or standalone app. Expo Go cannot run it. On a Mac with Xcode and CocoaPods, use `npm run ios`. With Java and Android SDK installed, use `npm run android`. After creating a native build, `npm start` starts Metro for that development client. The current Windows host generated Android successfully but cannot generate or compile the iOS project.

## Reproducible native projects and cloud profiles

This project uses Expo Continuous Native Generation. `app.config.ts`, its plugins, native dependency versions and the lockfile are the source of truth for both platforms. Generated `ios/` and `android/` directories are ignored so credentials and machine changes are not committed. Run `npx expo prebuild` on a supported host to regenerate them. On macOS, `npx expo prebuild --platform ios` creates the Xcode project and Apple sign-in entitlement. `npx expo prebuild --platform android` creates the Android project.

Proposed identifiers are `com.easteats.app` for both platforms, and `easteats` for the app URL scheme. Confirm availability and ownership before the first store build. They have not been reserved in either store.

EAS profiles in `eas.json`:

| Profile | Android | iOS |
| --- | --- | --- |
| development | Internal development client | Registered-device development client |
| preview | Internal APK | Simulator build |
| production | Signed Android App Bundle | Signed App Store build |

After the owner signs in to Expo, links an EAS project and configures public environment variables in each EAS environment:

```sh
npx eas-cli login
npx eas-cli init
npx eas-cli build --platform android --profile preview
npx eas-cli build --platform ios --profile preview
npx eas-cli build --platform all --profile production
```

`eas init` needs the owner's Expo account choice. Record the returned project ID as `EAS_PROJECT_ID` and owner as `EAS_OWNER` in the relevant build environment. Do not invent a project ID. Set all `EXPO_PUBLIC_*` values in EAS too, since local ignored env files are not a reliable cloud configuration source. Supabase publishable and MapTiler keys are public, not service credentials.

Building may consume Expo build quota; store memberships, certificates and submission must be handled by the account owner. No build or submit command was run against a paid service in this preparation. Use the exact EAS build IDs after successful builds when submitting, rather than selecting an unrelated latest build.

## API and authentication contract

All existing `/api/*` requests send `Authorization: Bearer <current Supabase access token>`. The server verifies the user and scopes database access using RLS. Refresh tokens remain in encrypted SecureStore and are never sent to East Eats API routes or placed in links. App foreground/background changes start/stop Supabase token refresh. Custom URL callbacks accept only a PKCE code at the exact destination and reject fragment tokens.

Native searches create a UUID only for an explicit search/location/filter action. All polling requests reuse that UUID, preventing a new scraper run on each poll. Favorite search is bounded to three minutes and discovery to five. New matching restaurant IDs reach the list and map as they arrive, while existing order stays stable. A completed source snapshot removes old places that no longer match. Errors are not presented as a successful empty search.

Saved offline snapshots and unfinished taste drafts are encrypted, scoped to the authenticated user, and removed on sign-out or confirmed deletion. Offline saved data is labeled stale. Cache write failure does not turn a successful server save into a false failure.

Account deletion: native confirmation sends `DELETE /api/account` with `{ "confirmation": "DELETE" }`. The server must delete only the authenticated user's data and return `{ "deleted": true }`. Local sign-in and caches clear after success. Public information is at `/delete-account`, and the privacy link is `/privacy` on the production origin.

## Assets and checks

The native icon and adaptive foreground come from the existing East Eats SVG. See `assets/README.md` for font and icon provenance. PWA PNG icons and Apple touch icon were generated from the same source. From the repository root, regenerate with `node mobile/scripts/build-icons.mjs` (uses the existing Sharp dependency).

`npm run export:android` and `npm run export:ios` compile platform JavaScript/Hermes bundles. These are useful build checks, not installable APK/AAB/IPA artifacts and not proof of native runtime behavior. Physical-device sign-in, maps, permissions and deletion must still pass [release/DEVICE-QA.md](release/DEVICE-QA.md).
