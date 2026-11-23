import { test, expect, type Page } from '@playwright/test';

const signedOut = { user: null, configured: true, providers: { google: true, email: true }, demo: false, dataMode: 'live', profile: null, answers: null };
const newUser = { user: { id: 'email-fixture-user', email: 'fixture@example.invalid', name: 'Fixture Diner', pendingEmail: null, provider: 'email' }, configured: true, demo: false, dataMode: 'live', profile: null, answers: null, homeAddress: null, personalized: false, tutorialCompleted: false };

async function stubSession(page: Page) {
  const state = { signedIn: false };
  await page.route('**/api/session', route => route.fulfill({ json: state.signedIn ? newUser : signedOut }));
  for (const path of ['**/api/saved', '**/api/feedback']) await page.route(path, route => route.fulfill({ json: { items: [] } }));
  await page.route('**/api/meal', route => route.fulfill({ json: { pendingMeal: null } }));
  return state;
}

for (const viewport of [{ width: 375, height: 667 }, { width: 1440, height: 900 }]) {
  test(`creating an email account goes straight to the favorite questionnaire at ${viewport.width}px${viewport.width === 375 ? ' @smoke' : ''}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const state = await stubSession(page);
    const bodies: unknown[] = [];
    await page.route('**/auth/signup', route => { bodies.push(route.request().postDataJSON()); state.signedIn = true; return route.fulfill({ json: { status: 'signed-in', destination: '/' } }); });
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Continue with Google', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Sign up with email', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
    await expect(page.getByLabel('Name', { exact: true })).toBeFocused();
    await page.getByLabel('Name', { exact: true }).fill('Fixture Diner');
    await page.getByLabel('Email', { exact: true }).fill('fixture@example.invalid');
    const password = page.getByLabel('Password', { exact: true });
    await password.fill('correct horse battery');
    await expect(password).toHaveAttribute('type', 'password');
    await expect(password).toHaveAttribute('autocomplete', 'new-password');
    await page.getByRole('button', { name: 'Show password', exact: true }).click();
    await expect(password).toHaveAttribute('type', 'text');
    await expect(page.getByRole('button', { name: 'Hide password', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Where should we look near home?' })).toBeVisible();
    expect(bodies).toEqual([{ name: 'Fixture Diner', email: 'fixture@example.invalid', password: 'correct horse battery', next: '/' }]);
  });
}

test('email confirmation, sign-in errors, and the header shortcut', async ({ page }) => {
  const state = await stubSession(page);
  await page.route('**/auth/signup', route => route.fulfill({ json: { status: 'confirm-email', message: 'If fixture@example.invalid is new to East Eats, we sent a confirmation link there.' } }));
  let attempts = 0;
  await page.route('**/auth/password', route => { attempts += 1; if (attempts === 1) return route.fulfill({ status: 401, json: { error: 'That email and password don’t match an account.', code: 'INVALID_CREDENTIALS' } }); state.signedIn = true; return route.fulfill({ json: { status: 'signed-in', destination: '/' } }); });
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign up with email', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Fixture Diner');
  await page.getByLabel('Email', { exact: true }).fill('fixture@example.invalid');
  await page.getByLabel('Password', { exact: true }).fill('correct horse battery');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'we sent a confirmation link' })).toBeVisible();
  await expect(page.getByLabel('Password', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: 'we sent a confirmation link' })).toBeFocused();
  await page.getByRole('button', { name: 'I’ve confirmed, sign me in' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in with email' })).toBeVisible();
  await expect(page.getByLabel('Name', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('autocomplete', 'current-password');
  await page.getByLabel('Email', { exact: true }).fill('fixture@example.invalid');
  await page.getByLabel('Password', { exact: true }).fill('wrong password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'don’t match' })).toHaveText('That email and password don’t match an account.');
  await expect(page.getByLabel('Password', { exact: true })).toBeFocused();
  await page.getByLabel('Password', { exact: true }).fill('correct horse battery');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Where should we look near home?' })).toBeVisible();
});

test('the header Sign in opens email sign-in, and Google-only setups keep the old screen', async ({ page }) => {
  await stubSession(page);
  await page.goto('/');
  await page.getByRole('banner').getByRole('link', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sign in with email' })).toBeVisible();
  await expect(page.getByLabel('Email', { exact: true })).toBeFocused();
  await page.unroute('**/api/session');
  await page.route('**/api/session', route => route.fulfill({ json: { ...signedOut, providers: { google: true, email: false } } }));
  await page.reload();
  await expect(page.getByRole('link', { name: 'Continue with Google', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign up with email' })).toHaveCount(0);
  await expect(page.getByRole('banner').getByRole('link', { name: 'Sign in', exact: true })).toHaveAttribute('href', '/auth/login');
  await page.unroute('**/api/session');
  await page.route('**/api/session', route => route.fulfill({ json: { ...signedOut, providers: { google: false, email: true } } }));
  await page.reload();
  await expect(page.getByRole('button', { name: 'Sign up with email' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Continue with Google', exact: true })).toHaveCount(0);
});

test('delete-account page offers email sign-in for email accounts', async ({ page }) => {
  await stubSession(page);
  const bodies: unknown[] = [];
  await page.route('**/auth/password', route => { bodies.push(route.request().postDataJSON()); return route.fulfill({ status: 401, json: { error: 'That email and password don’t match an account.' } }); });
  await page.goto('/delete-account');
  await expect(page.getByRole('link', { name: 'Sign in to delete your account' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign in with email', exact: true }).click();
  await page.getByLabel('Email', { exact: true }).fill('fixture@example.invalid');
  await page.getByLabel('Password', { exact: true }).fill('correct horse battery');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'don’t match' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create an account' })).toHaveCount(0);
  expect(bodies).toEqual([{ email: 'fixture@example.invalid', password: 'correct horse battery', next: '/delete-account' }]);
});

test('forgot password sends a reset link without leaving the sign-in screen @smoke', async ({ page }) => {
  await stubSession(page);
  const bodies: unknown[] = [];
  await page.route('**/auth/reset', route => { bodies.push(route.request().postDataJSON()); return route.fulfill({ json: { status: 'reset-sent', message: 'If an account uses fixture@example.invalid, we sent a link to reset its password. Open it in this browser.' } }); });
  await page.goto('/');
  await page.getByRole('banner').getByRole('link', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Forgot password?' }).click();
  await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible();
  await expect(page.getByLabel('Email', { exact: true })).toBeFocused();
  await expect(page.getByLabel('Password', { exact: true })).toHaveCount(0);
  await page.getByLabel('Email', { exact: true }).fill('fixture@example.invalid');
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'we sent a link to reset' })).toBeFocused();
  expect(bodies).toEqual([{ email: 'fixture@example.invalid' }]);
  await page.getByRole('button', { name: 'Back to sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in with email' })).toBeVisible();
});

test('the reset page saves a new password and explains an expired link', async ({ page }) => {
  let signedIn = true;
  await page.route('**/api/session', route => route.fulfill({ json: signedIn ? newUser : signedOut }));
  let attempts = 0;
  const bodies: unknown[] = [];
  let windowOpen = true;
  await page.route('**/auth/update-password', route => { if (route.request().method() === 'GET') return route.fulfill({ json: { active: windowOpen } }); attempts += 1; bodies.push(route.request().postDataJSON()); return attempts === 1 ? route.fulfill({ status: 400, json: { error: 'Choose a password you haven’t used for this account.' } }) : route.fulfill({ json: { status: 'password-updated' } }); });
  await page.goto('/reset-password');
  await expect(page.getByText('Choose a new password for fixture@example.invalid.')).toBeVisible();
  const field = page.getByLabel('New password', { exact: true });
  await expect(field).toBeFocused();
  await expect(field).toHaveAttribute('autocomplete', 'new-password');
  await field.fill('old password here');
  await page.getByRole('button', { name: 'Save new password' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'haven’t used' })).toBeVisible();
  await expect(field).toBeFocused();
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  await field.fill('brand new password');
  await page.getByRole('button', { name: 'Save new password' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Your password is changed' })).toBeFocused();
  expect(bodies).toEqual([{ password: 'old password here' }, { password: 'brand new password' }]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  windowOpen = false;
  await page.reload();
  await expect(page.getByText('This reset link has expired. To get a new one, sign out here')).toBeVisible();
  await expect(page.getByLabel('New password', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Sign out and request a new link' })).toBeVisible();
  signedIn = false;
  await page.reload();
  await expect(page.getByText('This reset link has expired')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Request a new link' })).toHaveAttribute('href', '/');
});
