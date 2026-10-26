import { test, expect, type Page } from '@playwright/test';
import type { Restaurant } from '../../src/lib/contracts';

// Browser-only fixtures. No claim about a real restaurant and no paid API calls.
const fixturePlace: Restaurant = {
  id: 'ui-fixture-pho99', name: 'Pho99', address: 'Browser test fixture address', city: 'Coquitlam',
  lat: 49.28, lng: -122.79, cuisines: ['Vietnamese'], priceLevel: null, googleRating: null,
  reviewCount: 0, sourceUrl: 'https://example.test/pho99', imageUrl: null, websiteUrl: null,
  hours: [], isClosed: false, fetchedAt: '2026-10-25T00:00:00.000Z', features: null,
};
const queued = { id: 'ui-fixture-search-job', kind: 'favorite-search', status: 'queued', createdAt: '2026-10-25T00:00:00.000Z' };

async function openQuestionnaire(page: Page) {
  await page.route('**/api/session', route => route.fulfill({ json: { user: { id: 'ui-fixture-user' }, configured: true, demo: false, dataMode: 'live', profile: null, answers: null } }));
  await page.route('**/api/saved', route => route.fulfill({ json: { items: [] } }));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Where do you.*love eating/ })).toBeVisible();
  await page.clock.install();
  await page.getByRole('textbox', { name: 'Restaurant name' }).fill('Pho99');
  await page.getByRole('textbox', { name: /City/ }).fill('Coquitlam');
}

test('cached favorite matches remain selectable during a live Google Maps check', async ({ page }) => {
  await page.route('**/api/places/search', route => route.fulfill({ json: { items: [fixturePlace], job: queued, dataMode: 'live' } }));
  await page.route(`**/api/jobs/${queued.id}`, route => route.fulfill({ json: { job: { ...queued, status: 'running' } } }));
  await openQuestionnaire(page);
  await page.getByRole('button', { name: 'Find restaurant', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Searching Google Maps…');
  await expect(page.getByRole('button', { name: 'Add favorite', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Add favorite', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Pho99' })).toBeVisible();
});

test('a delayed favorite search stays pending and shows Pho99 without resubmission', async ({ page }) => {
  let polls = 0;
  const submitted: { query: string; city: string; searchId: string }[] = [];
  await page.route('**/api/places/search', route => {
    submitted.push(route.request().postDataJSON());
    return route.fulfill({ json: submitted.length === 1 ? { items: [], job: queued, dataMode: 'live' } : { items: [fixturePlace], job: null, dataMode: 'live' } });
  });
  await page.route(`**/api/jobs/${queued.id}`, route => {
    polls += 1;
    return route.fulfill({ json: { job: { ...queued, status: polls >= 3 ? 'succeeded' : 'running' } } });
  });
  await openQuestionnaire(page);
  await page.getByRole('button', { name: 'Find restaurant', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Searching Google Maps…');
  await expect(page.getByText(/No places matched|No results yet/)).toHaveCount(0);
  // Typing a draft must not silently change the submitted background search.
  await page.getByRole('textbox', { name: 'Restaurant name' }).fill('Unsubmitted draft');
  for (let count = 1; count <= 3; count++) {
    await page.clock.fastForward(3100);
    await expect.poll(() => polls).toBe(count);
  }
  await expect(page.getByRole('button', { name: 'Add favorite', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Search results for Pho99' })).toBeVisible();
  await expect(page.getByRole('status')).toHaveCount(0);
  expect(submitted[0].searchId).toMatch(/^[0-9a-f-]{36}$/);
  expect(submitted).toEqual([{ query: 'Pho99', city: 'Coquitlam', searchId: submitted[0].searchId }, { query: 'Pho99', city: 'Coquitlam', searchId: submitted[0].searchId }]);
  await expect(page.getByRole('textbox', { name: 'Restaurant name' })).toHaveValue('Unsubmitted draft');
});

test('repeating a favorite search makes a new intent while polling keeps its original ID', async ({ page }) => {
  const submitted: { query: string; city: string; searchId: string }[] = [];
  const seen = new Set<string>();
  await page.route('**/api/places/search', route => {
    const input = route.request().postDataJSON() as { query: string; city: string; searchId: string };
    submitted.push(input);
    const first = !seen.has(input.searchId); seen.add(input.searchId);
    return route.fulfill({ json: { items: first ? [] : [fixturePlace], job: first ? { ...queued, id: input.searchId } : null, dataMode: 'live' } });
  });
  await page.route('**/api/jobs/*', route => route.fulfill({ json: { job: { ...queued, status: 'succeeded' } } }));
  await openQuestionnaire(page);
  await page.getByRole('button', { name: 'Find restaurant', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Searching Google Maps…');
  await page.clock.fastForward(3100);
  await expect(page.getByRole('button', { name: 'Add favorite', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Find restaurant', exact: true }).click();
  await expect.poll(() => submitted.length).toBe(3);
  expect(submitted[0].searchId).toBe(submitted[1].searchId);
  expect(submitted[2].searchId).not.toBe(submitted[0].searchId);
  expect(submitted[2].query).toBe('Pho99');
});

test('an obsolete job cannot overwrite a newer favorite search', async ({ page }) => {
  let oldPollStarted = false;
  let releaseOldPoll: () => void = () => {};
  const submitted: string[] = [];
  await page.route('**/api/places/search', route => {
    const input = route.request().postDataJSON() as { query: string };
    submitted.push(input.query);
    return route.fulfill({ json: input.query === 'Pho99' ? { items: [], job: queued, dataMode: 'live' } : { items: [{ ...fixturePlace, id: 'ui-fixture-new', name: 'New Favorite' }], job: null, dataMode: 'live' } });
  });
  await page.route(`**/api/jobs/${queued.id}`, async route => {
    oldPollStarted = true;
    await new Promise<void>(resolve => { releaseOldPoll = resolve; });
    await route.fulfill({ json: { job: { ...queued, status: 'succeeded' } } }).catch(() => {});
  });
  await openQuestionnaire(page);
  await page.getByRole('button', { name: 'Find restaurant', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Searching Google Maps…');
  await page.clock.fastForward(3100);
  await expect.poll(() => oldPollStarted).toBe(true);
  await page.getByRole('textbox', { name: 'Restaurant name' }).fill('New Favorite');
  await page.getByRole('button', { name: 'Find restaurant', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Search results for New Favorite' })).toBeVisible();
  releaseOldPoll();
  await page.clock.fastForward(10000);
  await expect(page.getByRole('heading', { name: 'Search results for New Favorite' })).toBeVisible();
  await expect(page.getByText('New Favorite', { exact: true })).toBeVisible();
  expect(submitted).toEqual(['Pho99', 'New Favorite']);
});

test('a three-minute timeout is reported as unfinished instead of no matches', async ({ page }) => {
  await page.route('**/api/places/search', route => route.fulfill({ json: { items: [], job: queued, dataMode: 'live' } }));
  await page.route(`**/api/jobs/${queued.id}`, route => route.fulfill({ json: { job: { ...queued, status: 'running' } } }));
  await openQuestionnaire(page);
  await page.getByRole('button', { name: 'Find restaurant', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Searching Google Maps…');
  await page.clock.fastForward(180001);
  await expect(page.getByRole('status')).toContainText('This search is taking longer than expected');
  await expect(page.getByText(/No places matched|No results yet/)).toHaveCount(0);
  await expect(page.getByText('The search has not finished. Please try again.')).toBeVisible();
});
