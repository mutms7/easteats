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

// The real routes are covered in auth-flows.spec.ts; these check the form itself on a phone.
for (const viewport of [{ width: 375, height: 667 }]) {
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

