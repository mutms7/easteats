import { openAdjustSearch } from './search-fixtures';
import { test, expect, type Page } from '@playwright/test';
import type { Restaurant } from '../../src/lib/contracts';

// These are mocked browser fixtures, not claims about Waterloo businesses.
const profile = { version: 1, weights: { food: .35, taste: .3, value: .15, proximity: .1, service: .05, atmosphere: .05 }, cuisines: [], dishes: [], flavors: [], spicePreference: null, fusionPreference: null, interpretation: 'Browser fixture profile', updatedAt: '2026-10-25T00:00:00.000Z' };
const points = [
  { id: 'fixture-campus-noodles', name: 'Campus Noodles', lat: 43.52, lng: -80.52 },
  { id: 'fixture-campus-dumplings', name: 'Campus Dumplings', lat: 43.525, lng: -80.53 },
  { id: 'fixture-campus-fusion', name: 'Campus Fusion', lat: 43.51, lng: -80.505 },
];
const places = points.map(point => {
  const restaurant: Restaurant = { ...point, address: 'Browser fixture address', city: 'Waterloo', cuisines: ['Asian fusion'], priceLevel: 2, googleRating: null, reviewCount: 0, sourceUrl: 'https://example.test/', imageUrl: null, websiteUrl: null, hours: [], isClosed: false, fetchedAt: '2026-10-25T00:00:00.000Z', features: null };
  return { restaurant, score: 50, distanceKm: 1, confidence: 0, explanation: 'Browser fixture' };
});
const discoveryJob = { id: 'fixture-waterloo-discovery', kind: 'discovery', status: 'queued', createdAt: '2026-10-25T00:00:00.000Z' };
const reviewsJob = { id: 'fixture-waterloo-reviews', kind: 'details', status: 'running', createdAt: '2026-10-25T00:00:00.000Z' };

async function chooseWaterloo(page: Page) {
  await page.route('**/api/session', route => route.fulfill({ json: { user: { id: 'fixture-discovery-user' }, configured: true, demo: false, dataMode: 'live', profile, answers: { favorites: [{ restaurantId: 'fixture-favorite', name: 'Favorite', city: '', reasons: ['Food'], notes: '' }] } } }));
  await page.route('**/api/saved', route => route.fulfill({ json: { items: [] } }));
  await page.route('**/api/geocode', route => route.fulfill({ json: { items: [{ label: 'University Avenue, Waterloo, Ontario', lat: 43.517834, lng: -80.517859 }] } }));
  await page.route('**/api/searches', route => route.fulfill({ json: { items: [] } }));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Where are.*we eating/ })).toBeVisible();
  await page.clock.install();
  await page.getByRole('combobox', { name: 'Address or area' }).fill('University Avenue Waterloo');
  await page.getByRole('button', { name: 'Find area', exact: true }).click();
  await page.getByRole('option', { name: 'University Avenue, Waterloo, Ontario', exact: true }).click();
  await page.getByRole('button', { name: 'Start search', exact: true }).click();
}

test('a cold area fills automatically and exposes every matching map location @smoke', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  let requests = 0, polls = 0;
  const submitted: { searchId: string; lat: number; lng: number }[] = [];
  await page.route('**/api/discover', route => {
    submitted.push(route.request().postDataJSON()); requests += 1;
    const items = requests >= 3 ? [places[1], places[2], places[0]] : requests === 2 ? places.slice(0, 1) : [];
    return route.fulfill({ json: { items, job: { ...discoveryJob, status: requests >= 3 ? 'succeeded' : 'running' }, enrichmentJob: requests >= 3 ? reviewsJob : null, searchPhase: requests >= 3 ? 'reviews' : 'places', refreshing: true, profileVersion: 1, dataMode: 'live' } });
  });
  await page.route(`**/api/jobs/${discoveryJob.id}`, route => { polls += 1; return route.fulfill({ json: { job: { ...discoveryJob, status: polls >= 4 ? 'succeeded' : 'running' } } }); });
  await page.route(`**/api/jobs/${reviewsJob.id}`, route => route.fulfill({ json: { job: reviewsJob } }));
  await chooseWaterloo(page);
  await expect(page.getByRole('status').filter({ hasText: 'Searching Google Maps for places' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'No matching places found' })).toHaveCount(0);
  await expect(page.getByRole('complementary', { name: 'Map view' })).toBeVisible();
  for (let count = 1; count <= 3; count++) { await page.clock.fastForward(3100); await expect.poll(() => polls).toBe(count); }
  // Places appear before reviews or even the discovery job are finished.
  await expect(page.getByRole('button', { name: 'Campus Noodles', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Fresh details are ready. Update results' })).toHaveCount(0);
  await expect(page.locator('.map-locations summary')).toHaveText('1 matching place on the map');
  await expect(page.locator('.map-locations button')).toHaveCount(1);
  expect(submitted[0].searchId).toMatch(/^[0-9a-f-]{36}$/);
  expect(submitted[0].searchId).toBe(submitted[1].searchId);
  expect(submitted[0].lat).toBe(43.517834);
  await page.clock.fastForward(3100);
  await expect(page.getByRole('status').filter({ hasText: 'Places are ready' })).toBeVisible();
  // Source completion brings two new places. They reach both views without
  // applying a ranking update, even though the server ranked them first.
  await expect(page.locator('.restaurant-card')).toHaveCount(3);
  await expect(page.locator('.restaurant-card .restaurant-title').first()).toHaveText('Campus Noodles');
  await expect(page.locator('.map-locations summary')).toHaveText('3 matching places on the map');
  await expect(page.getByRole('button', { name: 'Fresh details are ready. Update results' })).toHaveCount(0);
  expect(submitted[2].searchId).toBe(submitted[0].searchId);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Show map', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Map view' })).toBeVisible();
  await expect(page.locator('.map-locations button')).toHaveCount(3);
  await page.locator('.map-locations button').filter({ hasText: 'Campus Noodles' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('.map-locations button').filter({ hasText: 'Campus Noodles' })).toHaveAttribute('aria-pressed', 'true');
});

test('every repeated discovery submit and filter change gets a fresh search ID', async ({ page }) => {
  const submitted: { searchId: string; query: string; radiusKm: number }[] = [];
  await page.route('**/api/discover', route => {
    submitted.push(route.request().postDataJSON());
    return route.fulfill({ json: { items: places, job: null, enrichmentJob: null, searchPhase: 'complete', refreshing: false, profileVersion: 1, dataMode: 'live' } });
  });
  await chooseWaterloo(page);
  await expect(page.getByRole('button', { name: 'Campus Noodles', exact: true })).toBeVisible();
  await openAdjustSearch(page); await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect.poll(() => submitted.length).toBe(2);
  await openAdjustSearch(page); await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect.poll(() => submitted.length).toBe(3);
  await openAdjustSearch(page); await page.getByRole('combobox', { name: 'Distance', exact: true }).selectOption('15');
  expect(submitted).toHaveLength(3);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect.poll(() => submitted.length).toBe(4);
  expect(new Set(submitted.map(input => input.searchId)).size).toBe(4);
  expect(submitted.map(input => input.query)).toEqual(['', '', '', '']);
  expect(submitted[3].radiusKm).toBe(15);
});

test('a failed cold-area search is not presented as a genuine empty result', async ({ page }) => {
  await page.route('**/api/discover', route => route.fulfill({ json: { items: [], job: { ...discoveryJob, status: 'failed' }, enrichmentJob: null, searchPhase: 'complete', refreshing: false, profileVersion: 1, dataMode: 'live' } }));
  await chooseWaterloo(page);
  await expect(page.getByRole('status').filter({ hasText: 'The live search did not finish' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'No matching places found' })).toHaveCount(0);
});

for (const cached of [false, true]) {
  test(`a live enqueue warning is unfinished and preserves ${cached ? 'cached places' : 'an honest empty state'}`, async ({ page }) => {
    const warning = 'The live search could not start. Please try again.';
    await page.route('**/api/discover', route => route.fulfill({ json: { items: cached ? places : [], job: null, enrichmentJob: null, searchPhase: 'complete', refreshing: false, profileVersion: 1, dataMode: 'live', warning } }));
    await chooseWaterloo(page);
    await expect(page.getByRole('status').filter({ hasText: warning })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'No matching places found' })).toHaveCount(0);
    if (cached) await expect(page.getByRole('button', { name: 'Campus Noodles', exact: true })).toBeVisible();
  });
}

test('an older discovery job cannot merge its places into a new search intent', async ({ page }) => {
  let oldPollStarted = false;
  let releaseOldPoll: () => void = () => {};
  const incoming = { ...places[1], restaurant: { ...places[1].restaurant, id: 'fixture-new-intent', name: 'New Search Result' } };
  await page.route('**/api/discover', route => {
    const input = route.request().postDataJSON() as { query: string };
    return route.fulfill({ json: { items: input.query ? [incoming] : places.slice(0, 1), job: input.query ? null : discoveryJob, searchPhase: input.query ? 'complete' : 'places', refreshing: !input.query, profileVersion: 1, dataMode: 'live' } });
  });
  await page.route(`**/api/jobs/${discoveryJob.id}`, async route => {
    oldPollStarted = true;
    await new Promise<void>(resolve => { releaseOldPoll = resolve; });
    await route.fulfill({ json: { job: { ...discoveryJob, status: 'succeeded' } } }).catch(() => {});
  });
  await chooseWaterloo(page);
  await expect(page.getByRole('button', { name: 'Campus Noodles', exact: true })).toBeVisible();
  await page.clock.fastForward(3100);
  await expect.poll(() => oldPollStarted).toBe(true);
  await openAdjustSearch(page); await page.getByRole('textbox', { name: 'Search dishes or restaurant names' }).fill('New restaurant');
  await openAdjustSearch(page); await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByRole('button', { name: 'New Search Result', exact: true })).toBeVisible();
  releaseOldPoll();
  await page.clock.fastForward(10000);
  await expect(page.locator('.restaurant-card')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Campus Noodles', exact: true })).toHaveCount(0);
  await expect(page.locator('.map-locations summary')).toHaveText('1 matching place on the map');
  await expect(page.locator('.map-locations button')).toContainText('New Search Result');
});
