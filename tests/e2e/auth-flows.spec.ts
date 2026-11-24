import { test, expect, type Page, type APIRequestContext } from '@playwright/test';

// These run the real /auth routes, cookies, PKCE codes and redirects against tests/e2e/fake-supabase.mjs.
// Nothing here is mocked in the browser, so a broken route, cookie or redirect fails the test.
const FAKE = 'http://127.0.0.1:3198';
let counter = 0;
const freshEmail = () => `diner-${Date.now()}-${counter++}@example.invalid`;

async function inbox(request: APIRequestContext, email: string, type: 'signup' | 'recovery') {
  const messages = await (await request.get(`${FAKE}/__mail?email=${encodeURIComponent(email)}`)).json() as { type: string; link: string }[];
  return messages.filter(message => message.type === type);
}
async function lastLink(request: APIRequestContext, email: string, type: 'signup' | 'recovery') {
  let link = '';
  await expect.poll(async () => (link = (await inbox(request, email, type)).at(-1)?.link ?? '')).not.toBe('');
  return link;
}
const post = (page: Page, path: string, body: unknown) => page.evaluate(async ([path, body]) => {
  const response = await fetch(path as string, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json().catch(() => null) };
}, [path, body] as const);
const signedInUser = (page: Page) => page.evaluate(async () => (await (await fetch('/api/session')).json()).user?.email ?? null);

async function openEmailSignIn(page: Page) {
  await page.goto('/');
  await page.getByRole('banner').getByRole('link', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sign in with email' })).toBeVisible();
}
async function signIn(page: Page, email: string, password: string) {
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}
// A confirmed account, created through the real sign-up and confirmation routes, then signed out.
async function createAccount(page: Page, email: string, password: string) {
  await page.goto('/');
  expect((await post(page, '/auth/signup', { name: 'Fixture Diner', email, password, next: '/' })).body).toMatchObject({ status: 'confirm-email' });
  await page.goto(await lastLink(page.request, email, 'signup'));
  await expect.poll(() => signedInUser(page)).toBe(email);
  expect((await post(page, '/auth/logout', {})).status).toBe(200);
}

test('email sign-up confirms by link, then signs out and back in with the real routes @smoke', async ({ page }) => {
  const email = freshEmail();
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Continue with Google', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /demo/i })).toHaveCount(0);
  await page.getByRole('button', { name: 'Sign up with email', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Fixture Diner');
  await page.getByLabel('Email', { exact: true }).fill(email.toUpperCase());
  await page.getByLabel('Password', { exact: true }).fill('correct horse battery');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: `If ${email} is new to East Eats, we sent a confirmation link` })).toBeFocused();

  await page.getByRole('button', { name: 'I’ve confirmed, sign me in' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in with email' })).toBeVisible();
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('autocomplete', 'current-password');

  // Unconfirmed accounts can't sign in yet.
  expect((await post(page, '/auth/password', { email, password: 'correct horse battery' })).body).toMatchObject({ code: 'EMAIL_NOT_CONFIRMED' });

  // The emailed link signs this browser in and goes straight to the favorite restaurant questionnaire.
  await page.goto(await lastLink(page.request, email, 'signup'));
  await expect(page.getByRole('heading', { name: 'Where should we look near home?' })).toBeVisible();
  expect(await signedInUser(page)).toBe(email);

  await page.getByRole('button', { name: 'Account', exact: true }).click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Continue with Google', exact: true })).toBeVisible();
  expect(await signedInUser(page)).toBeNull();

  await openEmailSignIn(page);
  await signIn(page, email, 'not the password');
  await expect(page.getByRole('alert').filter({ hasText: 'don’t match' })).toBeVisible();
  await expect(page.getByLabel('Password', { exact: true })).toBeFocused();
  await signIn(page, email, 'correct horse battery');
  await expect(page.getByRole('heading', { name: 'Where should we look near home?' })).toBeVisible();

  // Signing up again with the same email doesn't reveal the account or make a second one.
  await post(page, '/auth/logout', {});
  expect((await post(page, '/auth/signup', { name: 'Someone Else', email, password: 'another password', next: '/' })).body).toMatchObject({ status: 'confirm-email' });
  expect(await inbox(page.request, email, 'signup')).toHaveLength(1);
});

test('forgot password works only from the emailed link in the same browser, and signs out other devices @smoke', async ({ page, browser }) => {
  const email = freshEmail(), oldPassword = 'correct horse battery', newPassword = 'a brand new password';
  await createAccount(page, email, oldPassword);

  // Another device that's signed in with the old password.
  const other = await browser.newContext({ baseURL: 'http://127.0.0.1:3199' }), otherPage = await other.newPage();
  await otherPage.goto('/');
  expect((await post(otherPage, '/auth/password', { email, password: oldPassword })).status).toBe(200);
  expect(await signedInUser(otherPage)).toBe(email);
  // Being signed in isn't enough to change the password without a reset link.
  expect((await post(otherPage, '/auth/update-password', { password: 'sneaky new password' })).body).toMatchObject({ code: 'RESET_EXPIRED' });

  // Unknown emails get the same answer and no email, so the form can't be used to find accounts.
  await page.goto('/');
  const stranger = freshEmail();
  expect((await post(page, '/auth/reset', { email: stranger })).body).toMatchObject({ status: 'reset-sent' });
  expect(await inbox(page.request, stranger, 'recovery')).toHaveLength(0);

  await openEmailSignIn(page);
  await page.getByRole('button', { name: 'Forgot password?' }).click();
  await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible();
  await expect(page.getByLabel('Email', { exact: true })).toBeFocused();
  await expect(page.getByLabel('Password', { exact: true })).toHaveCount(0);
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByRole('status').filter({ hasText: `If an account uses ${email}, we sent a link to reset its password` })).toBeFocused();
  const link = await lastLink(page.request, email, 'recovery');
  await page.getByRole('button', { name: 'Back to sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in with email' })).toBeVisible();

  // The same link opened in a different browser doesn't sign anyone in.
  const elsewhere = await browser.newContext({ baseURL: 'http://127.0.0.1:3199' }), elsewherePage = await elsewhere.newPage();
  await elsewherePage.goto(link);
  await expect(elsewherePage).toHaveURL(/\/\?auth=failed$/);
  await expect(elsewherePage.getByText('Sign-in did not finish.')).toBeVisible();
  expect(await signedInUser(elsewherePage)).toBeNull();
  await elsewhere.close();

  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto(link);
  await expect(page).toHaveURL(/\/reset-password$/);
  await expect(page.getByText(`Choose a new password for ${email}.`)).toBeVisible();
  const field = page.getByLabel('New password', { exact: true });
  await expect(field).toBeFocused();
  await field.fill(oldPassword);
  await page.getByRole('button', { name: 'Save new password' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'haven’t used' })).toBeVisible();
  await field.fill(newPassword);
  await page.getByRole('button', { name: 'Save new password' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Your password is changed' })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  // The other device is signed out, and the reset window is closed.
  expect(await signedInUser(otherPage)).toBeNull();
  await other.close();
  await page.reload();
  await expect(page.getByText('This reset link has expired. To get a new one, sign out here')).toBeVisible();
  await page.getByRole('button', { name: 'Sign out and request a new link' }).click();
  await expect(page.getByRole('link', { name: 'Continue with Google', exact: true })).toBeVisible();
  // Signed out, the reset page points back to the sign-in screen for a new link.
  await page.goto('/reset-password');
  await expect(page.getByRole('link', { name: 'Request a new link' })).toHaveAttribute('href', '/');

  await openEmailSignIn(page);
  await signIn(page, email, oldPassword);
  await expect(page.getByRole('alert').filter({ hasText: 'don’t match' })).toBeVisible();
  await signIn(page, email, newPassword);
  await expect(page.getByRole('heading', { name: 'Where should we look near home?' })).toBeVisible();
});
