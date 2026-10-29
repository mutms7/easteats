import { openAdjustSearch } from './search-fixtures';
import { test, expect } from '@playwright/test';
import { fixturePlace, fixtureSearch, searchFixtures } from './search-fixtures';

test('latest search and history open snapshots without discovery, including after taste changes', async ({ page }) => {
  const second = fixtureSearch('22222222-2222-4222-8222-222222222222', 'Fixture dumpling day', [fixturePlace('fixture-dumplings', 'Fixture Dumpling House')]);
  const state = await searchFixtures(page, [fixtureSearch(), second]);
  await page.goto('/'); await expect(page.getByRole('heading', { name: 'Fixture noodle night', exact: true })).toBeVisible();
  expect(state.discover).toHaveLength(0);
  await page.locator('.search-history-chip').filter({ hasText: 'Fixture dumpling day' }).click();
  await expect(page.getByRole('heading', { name: 'Fixture dumpling day', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Fixture Dumpling House', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Taste', exact: true }).click();
  await page.getByRole('button', { name: 'Find my next meal', exact: true }).click();
  await page.getByRole('button', { name: /find somewhere/ }).click();
  await expect(page.getByRole('heading', { name: 'Fixture dumpling day', exact: true })).toBeVisible();
  expect(state.discover).toHaveLength(0);
});

test('new search waits for Start, refresh keeps the conversation, and a query creates a new one', async ({ page }) => {
  const state = await searchFixtures(page);
  await page.goto('/'); await expect(page.locator('.restaurant-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'New search', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Address or area' })).toHaveValue(state.home!.label);
  expect(state.discover).toHaveLength(0);
  await page.getByRole('combobox', { name: 'Cuisine', exact: true }).selectOption('Korean');
  await page.getByRole('combobox', { name: 'Food type', exact: true }).selectOption('noodles');
  expect(state.discover).toHaveLength(0);
  await page.getByRole('button', { name: 'Start search', exact: true }).click();
  await expect.poll(() => state.discover.length).toBe(1); await expect(page.locator('.restaurant-card')).toHaveCount(1);
  expect(state.discover[0].savedSearchId).toBeUndefined();
  expect(state.discover[0]).toMatchObject({ cuisine: 'Korean', foodType: 'noodles' });
  const conversation = state.discover[0].searchId;
  await page.getByRole('button', { name: 'Refresh search', exact: true }).click();
  await expect.poll(() => state.discover.length).toBe(2);
  expect(state.discover[1].savedSearchId).toBe(conversation);
  expect(state.discover[1].searchId).not.toBe(conversation);
  await openAdjustSearch(page); await page.getByRole('textbox', { name: 'Search dishes or restaurant names' }).fill('dumplings');
  await openAdjustSearch(page); await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect.poll(() => state.discover.length).toBe(3);
  expect(state.discover[2].savedSearchId).toBeUndefined();
  expect(new Set(state.discover.map(item => item.searchId)).size).toBe(3);
});

test('switching history cancels a late active search response', async ({ page }) => {
  const saved = fixtureSearch(); const state = await searchFixtures(page, [saved]);
  let release: () => void = () => {}; let sourceStarted = false;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/discover', async route => { sourceStarted = true; await held; await route.fulfill({ json: { items: [fixturePlace('late', 'Late stale result')], job: null, profileVersion: 1, dataMode: 'live', refreshing: false } }).catch(() => {}); });
  await page.goto('/'); await expect(page.locator('.restaurant-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'New search', exact: true }).click(); await page.getByRole('button', { name: 'Start search', exact: true }).click();
  await expect.poll(() => sourceStarted).toBe(true);
  await page.locator('.search-history-chip').filter({ hasText: saved.title }).click();
  await expect(page.getByRole('heading', { name: saved.title, exact: true })).toBeVisible();
  release(); await page.waitForTimeout(100);
  await expect(page.getByRole('button', { name: 'Fixture Noodle House', exact: true })).toBeVisible();
  await expect(page.getByText('Late stale result', { exact: true })).toHaveCount(0);
  expect(state.discover).toHaveLength(0);
});

test('like undo, dislike, and liked collection are independent of bookmarks and never rerun discovery', async ({ page }) => {
  const state = await searchFixtures(page);
  await page.goto('/'); await expect(page.locator('.restaurant-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Like Fixture Noodle House', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Unlike Fixture Noodle House', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Saved', exact: true }).click();
  const liked = page.getByRole('region', { name: 'Liked places', exact: true });
  await expect(liked.getByRole('button', { name: 'Fixture Noodle House', exact: true })).toBeVisible();
  await liked.getByRole('button', { name: 'Unlike Fixture Noodle House', exact: true }).click();
  await expect(liked.locator('.saved-card')).toHaveCount(0);
  await page.getByRole('button', { name: 'Explore', exact: true }).click();
  await page.getByRole('button', { name: 'Dislike Fixture Noodle House', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Undo dislike for Fixture Noodle House', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(state.feedbackWrites.map(item => item.sentiment)).toEqual(['like', null, 'dislike']);
  expect(state.discover).toHaveLength(0);
});

test('Eat here asks only on the next visit, Not yet defers, and Neutral answers the meal', async ({ page }) => {
  const state = await searchFixtures(page);
  await page.goto('/'); await expect(page.locator('.restaurant-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Eat here at Fixture Noodle House', exact: true }).click();
  await expect.poll(() => state.meals.length).toBe(1);
  await expect(page.getByRole('region', { name: 'Meal check-in' })).toHaveCount(0);
  await page.reload(); const checkin = page.getByRole('region', { name: 'Meal check-in' });
  await expect(checkin.getByRole('heading', { name: 'How was Fixture Noodle House?' })).toBeVisible();
  await checkin.getByRole('button', { name: 'Not yet', exact: true }).click();
  await expect(checkin).toHaveCount(0); expect(state.feedbackWrites).toHaveLength(0);
  await page.reload(); await expect(checkin).toBeVisible();
  await checkin.getByRole('button', { name: 'Neutral', exact: true }).click();
  await expect(checkin).toHaveCount(0);
  expect(state.feedbackWrites.at(-1)).toMatchObject({ restaurantId: 'fixture-noodles', sentiment: 'neutral', answerMeal: true });
  expect(state.discover).toHaveLength(0);
});

test('compact circles are readable graphics, history closes on selection, and both layouts fit', async ({ page }, testInfo) => {
  const state = await searchFixtures(page, [fixtureSearch(), fixtureSearch('22222222-2222-4222-8222-222222222222', 'Fixture other search')]);
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/');
  const card = page.locator('.restaurant-card').first(); await expect(card).toBeVisible();
  await expect(page.locator('.search-adjust')).not.toHaveAttribute('open', '');
  expect((await card.boundingBox())!.y).toBeLessThan(600);
  const titleBox = (await card.locator('.restaurant-title').boundingBox())!;
  const navigationBox = (await page.getByRole('navigation', { name: 'Main navigation' }).boundingBox())!;
  expect(titleBox.y + titleBox.height).toBeLessThan(navigationBox.y);
  await expect(card.getByRole('img', { name: 'Food: 83 out of 100', exact: true })).toBeVisible();
  await expect(card.getByRole('img', { name: 'Value: 0 out of 100', exact: true })).toBeVisible();
  await expect(card.getByRole('img', { name: 'Service: Unknown', exact: true })).toBeVisible();
  await expect(card.locator('.score-circle-item')).toHaveCount(5);
  await expect(card.getByRole('slider')).toHaveCount(0); await expect(card.locator('details')).toHaveCount(0);
  await expect(page.getByText('Why this place', { exact: true })).toHaveCount(0);
  await page.locator('.search-history-all summary').click(); await page.locator('.search-history-all button').filter({ hasText: 'Fixture other search' }).click();
  await expect(page.locator('.search-history-all')).not.toHaveAttribute('open', '');
  await expect(page.getByRole('heading', { name: 'Fixture other search', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('saved-search-phone.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.screenshot({ path: testInfo.outputPath('saved-search-desktop.png'), fullPage: true });
  expect(state.discover).toHaveLength(0);
});

test('a completed source refreshes its delayed title once using only history metadata', async ({ page }) => {
  const state = await searchFixtures(page); await page.goto('/'); await expect(page.locator('.restaurant-card')).toHaveCount(1);
  await page.clock.install();
  await page.getByRole('button', { name: 'New search', exact: true }).click(); await page.getByRole('button', { name: 'Start search', exact: true }).click();
  await expect.poll(() => state.discover.length).toBe(1); await expect(page.locator('.restaurant-card')).toHaveCount(1);
  state.history[0].title = 'Fixture named noodle search'; const reads = state.historyReads;
  await page.clock.fastForward(10_100);
  await expect(page.getByRole('heading', { name: 'Fixture named noodle search', exact: true })).toBeVisible();
  expect(state.historyReads).toBe(reads + 1);
  await page.clock.fastForward(60_000);
  expect(state.historyReads).toBe(reads + 1); expect(state.discover).toHaveLength(1);
});

test('adjustments stay free until one submit, and Refresh ignores unsubmitted drafts', async ({ page }) => {
  const state = await searchFixtures(page); await page.goto('/'); await expect(page.locator('.restaurant-card')).toHaveCount(1);
  await openAdjustSearch(page);
  await page.getByRole('textbox', { name: 'Search dishes or restaurant names' }).fill('dumplings');
  await page.getByRole('combobox', { name: 'Cuisine', exact: true }).selectOption('Chinese');
  await page.getByRole('combobox', { name: 'Food type', exact: true }).selectOption('dumplings');
  await page.getByRole('combobox', { name: 'Distance', exact: true }).selectOption('15');
  expect(state.discover).toHaveLength(0);
  await page.getByRole('button', { name: 'Refresh search', exact: true }).click();
  await expect.poll(() => state.discover.length).toBe(1);
  expect(state.discover[0]).toMatchObject({ query: '', cuisine: '', radiusKm: 5, savedSearchId: '11111111-1111-4111-8111-111111111111' });
  expect(state.discover[0].foodType ?? '').toBe('');
  await openAdjustSearch(page);
  await page.getByRole('textbox', { name: 'Search dishes or restaurant names' }).fill('dumplings');
  await page.getByRole('combobox', { name: 'Cuisine', exact: true }).selectOption('Chinese');
  await page.getByRole('combobox', { name: 'Food type', exact: true }).selectOption('dumplings');
  await page.getByRole('combobox', { name: 'Distance', exact: true }).selectOption('15');
  expect(state.discover).toHaveLength(1);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect.poll(() => state.discover.length).toBe(2);
  expect(state.discover[1]).toMatchObject({ query: 'dumplings', cuisine: 'Chinese', foodType: 'dumplings', radiusKm: 15 });
  expect(state.discover[1].savedSearchId).toBeUndefined();
  await expect(page.locator('.search-adjust')).not.toHaveAttribute('open', '');
});
