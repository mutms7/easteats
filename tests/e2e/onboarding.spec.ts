import { test, expect } from '@playwright/test';
import { fixtureHome, fixturePlace, fixtureProfile, searchFixtures } from './search-fixtures';

test('signup asks one question at a time, biases addresses and favorites by GPS, and preserves answers with Back', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 43.47, longitude: -80.54 });
  const state = await searchFixtures(page, [], false);
  state.home = null;
  const requests: Record<string, unknown>[] = [];
  await page.route('**/api/geocode', route => { requests.push(route.request().postDataJSON()); return route.fulfill({ json: { items: [fixtureHome] } }); });
  await page.route('**/api/places/search', route => { requests.push(route.request().postDataJSON()); return route.fulfill({ json: { items: [fixturePlace().restaurant], job: null } }); });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Where should we look near home?' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Restaurant name' })).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Home address', exact: true }).fill('Fixture home');
  await page.getByRole('option', { name: fixtureHome.label }).click();
  expect(requests[0]).toMatchObject({ proximity: { lat: 43.47, lng: -80.54 } });
  await page.getByRole('button', { name: 'Skip home address' }).click();
  await expect(page.getByRole('heading', { name: 'What’s your favorite restaurant?' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Restaurant name' }).fill('Noodles');
  await page.getByRole('button', { name: 'Find restaurant', exact: true }).click();
  await page.getByRole('button', { name: 'Add favorite', exact: true }).click();
  expect(requests.at(-1)).toMatchObject({ proximity: { lat: 43.47, lng: -80.54 }, city: '' });
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  // The fixture has one pre-existing favorite, then the newly selected one.
  await expect(page.getByRole('heading', { name: /What do you love about/ })).toBeVisible();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'The food itself', exact: true }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('group', { name: 'What matters most right now?' })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('button', { name: 'The food itself', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.goForward();
  await page.getByRole('button', { name: 'Find my next meal', exact: true }).click();
  await page.getByRole('button', { name: 'Edit my favorites', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your taste preferences', exact: true })).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Signup progress' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Next', exact: true })).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Fixture Noodle House', exact: true })).toBeVisible();
  await expect(page.getByRole('group', { name: 'What matters most right now?', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back to exploring', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Your first search' })).toBeVisible();
  await page.getByRole('button', { name: 'Start search', exact: true }).click();
  await expect.poll(() => state.discover.length).toBe(1);
  expect(state.discover[0]).toMatchObject({ lat: 43.47, lng: -80.54, radiusKm: 1 });
});

test('tutorial can be skipped, stays dismissed after reload, and can be reopened from Account', async ({ page }) => {
  await searchFixtures(page);
  let completed = false;
  await page.route('**/api/session', route => route.fulfill({ json: { user: { id: 'tutorial-user' }, profile: fixtureProfile, tutorialCompleted: completed, dataMode: 'live' } }));
  await page.route('**/api/tutorial', route => { completed = true; return route.fulfill({ json: { completed } }); });
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'Take a closer look' })).toBeVisible();
  await page.getByRole('button', { name: 'Skip tutorial' }).click();
  await expect(page.locator('.tutorial-coach')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Fixture noodle night' })).toBeVisible();
  await expect(page.locator('.tutorial-coach')).toHaveCount(0);
  await page.getByRole('button', { name: 'Account', exact: true }).click();
  await page.getByRole('button', { name: 'Show tutorial' }).click();
  await expect(page.getByRole('region', { name: 'Take a closer look' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Fixture noodle night' })).toBeVisible();
});

test('Back and Forward retain sign-in, Eat here shows a visible confirmation, and saved radius stays intact', async ({ page }) => {
  await searchFixtures(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Account', exact: true }).click();
  await page.getByRole('button', { name: 'Options', exact: true }).click();
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Your account' })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Fixture noodle night' })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole('heading', { name: 'Your account' })).toBeVisible();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('button', { name: /Eat here at/ }).click();
  await expect(page.locator('.confirmation-toast')).toBeInViewport();
  await expect(page.locator('.confirmation-toast')).toContainText('You chose Fixture Noodle House');
  await expect(page.getByText(/doesn’t make a reservation/)).toBeVisible();
});

test('temporary account-loading failure offers retry instead of asking for another sign-in', async ({ page }) => {
  await searchFixtures(page, []);
  await page.route('**/api/session', route => route.fulfill({ status: 503, json: { error: 'Temporary connection issue' } }));
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Retry connection' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Continue with Google' })).toHaveCount(0);
  await page.unroute('**/api/session');
});

test('search indicator remains visible through partial places and review enrichment', async ({ page }) => {
  const state = await searchFixtures(page, []);
  const queued = { id: 'progress-job', kind: 'discovery', status: 'running', createdAt: new Date().toISOString() };
  let phase = 'places';
  await page.route('**/api/discover', route => route.fulfill({ json: { items: [fixturePlace()], refreshing: true, job: phase === 'places' ? queued : null, enrichmentJob: phase === 'reviews' ? { ...queued, id: 'reviews-job', kind: 'details' } : null, searchPhase: phase, dataMode: 'live', profileVersion: 1 } }));
  await page.route('**/api/jobs/*', route => route.fulfill({ json: { job: { ...queued, status: 'succeeded' } } }));
  await page.goto('/');
  await page.clock.install();
  await page.getByRole('button', { name: 'Start search', exact: true }).click();
  await expect(page.locator('.restaurant-card')).toHaveCount(1);
  await expect(page.locator('.search-spinner')).toBeVisible();
  await expect(page.locator('.restaurant-list')).toHaveAttribute('aria-busy', 'true');
  phase = 'reviews'; await page.clock.fastForward(3100);
  await expect(page.getByRole('status').filter({ hasText: 'checking food details' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'checking food details' }).getByRole('link', { name: 'Questions?' })).toHaveAttribute('href', '/questions');
  await expect(page.locator('.search-spinner')).toBeVisible();
  phase = 'complete'; await page.clock.fastForward(3100);
  await expect(page.locator('.search-spinner')).toHaveCount(0);
  await expect(page.locator('.restaurant-list')).toHaveAttribute('aria-busy', 'false');
  expect(state.home).toEqual(fixtureHome);
});

test('Chrome restoring the pre-sign-in page rechecks the authenticated session', async ({ page }) => {
  await searchFixtures(page);
  let signedIn = false;
  await page.route('**/api/session', route => route.fulfill({ json: { user: signedIn ? { id: 'returning-user' } : null, configured: true, profile: signedIn ? fixtureProfile : null, dataMode: 'live' } }));
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Continue with Google' })).toBeVisible();
  signedIn = true;
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  await expect(page.getByRole('heading', { name: 'Fixture noodle night' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Continue with Google' })).toHaveCount(0);
});
