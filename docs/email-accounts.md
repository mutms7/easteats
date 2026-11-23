# Email accounts, November 7, 2026

People can now create an East Eats account with a name, email and password instead of Google. "Sign up with email" sits under Continue with Google on the sign-in screen and opens a short form. A new account goes through the same flow as Google: once signed in, the favorite restaurant questionnaire starts. Returning email users switch the form to "Sign in", and the header Sign in link opens that mode directly. The delete-account page offers email sign-in too, so email users can still delete their account.

Accounts live in Supabase Auth next to Google identities. `POST /auth/signup` calls `signUp` with the name as `full_name`, and `POST /auth/password` calls `signInWithPassword`. Both routes check the request origin, require a JSON body (so a plain cross-site form can't post a login), validate strictly with Zod, and map Supabase errors to fixed messages. Passwords are only forwarded to Supabase, never logged or returned. Passwords need 8 characters and at most 72 bytes, which is bcrypt's limit.

The sign-in screen only shows methods Supabase reports as enabled through `/auth/v1/settings`. If Google is off and email is on, only the email option appears. If email is off or sign-ups are disabled, the screen looks exactly as it did before.

## Keep "Confirm email" on

With confirmation on, sign-up gives the same "we sent a confirmation link" response whether or not the email already has an account, so the form can't be used to check who's registered. It also stops someone from creating a password account on another person's email. Turning confirmation off would still work (the user is signed in right away), but it would lose both protections. As of today, production has email on, sign-ups open, and confirmation required.

The confirmation link uses Supabase's PKCE flow, so it finishes in the browser where the person signed up. If it's opened somewhere else, the account is still confirmed and the notice tells them to sign in with their email and password. The callback deliberately doesn't accept `token_hash` links, because one could sign a browser into somebody else's account.

## Forgot password

"Forgot password?" sits under the password field when signing in. It sends a Supabase recovery link through `POST /auth/reset`, which gives the same answer whether or not the email has an account. The link only works in the browser that asked for it, because Supabase saves the PKCE verifier there and marks it as a recovery. When the callback sees that recovery, it sets a 15-minute httpOnly cookie for that user and opens `/reset-password`. `POST /auth/update-password` only accepts a new password while that cookie matches the signed-in user, so someone at an already signed-in browser can't use East Eats to replace the password. It doesn't stop stolen session tokens, which can call Supabase directly, so turn on Supabase's "Secure password change" setting for that. A successful change closes the window and signs out every other session. If the window has run out, the reset page says so and offers to sign out so a new link can be requested.

Each link uses the PKCE verifier saved when it was requested, and starting another sign-in in the same browser or app replaces it. The sent messages warn about this, and a failed link explains it.

## Mobile app

The native app has the same three flows on its signed-out screen: Sign up with email and Sign in with email buttons, with Forgot password inside sign-in. It calls Supabase directly from the phone, like Google and Apple sign-in, and email links return through the existing `easteats://auth/callback` PKCE handler with the verifier in SecureStore, so confirmation and reset links only finish on the phone that asked for them. When Supabase reports a `PASSWORD_RECOVERY` sign-in, the app shows a "Choose a new password" screen before anything else, and remembers that in SecureStore so the prompt comes back if the app restarts before the password is saved. The rules and error messages come from `src/lib/account-rules.ts`, the same file the website uses, and the email actions live in `mobile/src/email-auth.ts` with the client passed in so they can be tested in Node.

## Verification

- Unit and integration tests cover sign-up, sign-in, reset, the recovery window, setting the new password, input limits, origin and content-type checks on all four routes, error mapping, cookies, provider detection, the session route, and the refused token-hash link. Mobile tests cover the native email actions with a fake Supabase client. Every guarded path was checked by planting a bug and confirming a test fails.
- Browser journeys cover sign-up straight into the questionnaire at 375px and 1440px, the confirmation message, wrong-password recovery, forgot password, the reset page (including a rejected password and an expired link), the header shortcut, Google-only and email-only setups, and delete-account sign-in.
- The mobile app typechecks and its Android and iOS bundles export. It hasn't been run on a device or simulator.
- Real-service checks covered reading the production auth settings only. A real sign-up, the confirmation and reset emails, and signing in against Supabase haven't been exercised.

## Not included yet

Supabase counts the website's rate limits against the server's IP, because those requests go through the Next server (the mobile app calls Supabase directly, so it's per phone). Its built-in email sender only allows a few messages an hour, so a custom SMTP provider is worth setting up before a launch.
