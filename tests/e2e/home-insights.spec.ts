import { test, expect, type Page } from '@playwright/test';
import type { DiscoverInput, SavedLocation, TasteInput } from '../../src/lib/contracts';
import { searchFixtures, openAdjustSearch } from './search-fixtures';

// All businesses, review excerpts and addresses below are browser fixtures.
const home = { label: 'Fixture home, Waterloo, ON', lat: 43.52, lng: -80.52 };
const changedHome = { label: 'Second fixture home, Toronto, ON', lat: 43.65, lng: -79.38 };
const manual = { label: 'Fixture visit, Coquitlam, BC', lat: 49.25, lng: -122.79 };
const profile = { version: 1, weights: { food: .35, taste: .3, value: .15, proximity: .1, service: .05, atmosphere: .05 }, cuisines: ['Korean'], dishes: ['Noodles'], flavors: [], spicePreference: null, fusionPreference: null, interpretation: 'Fixture taste profile.', updatedAt: '2026-10-28T00:00:00Z' };
const answers: TasteInput = { favorites: [{ restaurantId: 'fixture-favorite', name: 'Fixture favorite', city: 'Waterloo', reasons: ['The food itself'], notes: '' }], goal: 'balanced' };
const restaurant = { id: 'fixture-noodle-house', name: 'Fixture Noodle House', address: 'Fixture restaurant address', city: 'Waterloo', cuisines: ['Korean'], lat: 43.521, lng: -80.52, priceLevel: 2, googleRating: 3.5, reviewCount: 50, sourceUrl: 'https://example.test/place', imageUrl: null, websiteUrl: null, hours: [], isClosed: false, fetchedAt: '2026-10-28T00:00:00Z', features: { foodQuality: .83, value: null, service: null, atmosphere: null, cuisines: ['Korean'], dishes: ['Noodles'], flavors: [], spice: null, fusion: false, reviewCount: 8, confidence: .7, evidence: [{ id: 'fixture-food-review', aspect: 'food', text: 'Fixture noodles have good texture.', sourceUrl: 'https://example.test/review' }], updatedAt: '2026-10-28T00:00:00Z' } };
const ranked = { restaurant, score: 65, distanceKm: 1, confidence: .7, explanation: 'Fixture context.', matchReasons: ['Your favorite mentions noodles; this place lists noodles.'], scoreBreakdown: { food: 83, value: null, service: null, atmosphere: null, taste: null } };

async function fixtures(page: Page, initialHome: SavedLocation | null, completed = true) {
  const state = await searchFixtures(page, [], completed);
  state.home = initialHome;
  await page.route('**/api/geocode', route => { const query = route.request().postDataJSON().query as string; return route.fulfill({ json: { items: query.includes('Second') ? [changedHome] : query.includes('visit') ? [manual] : [home] } }); });
  return { ...state, discoveries: state.discover };
}
async function selectHome(page: Page, text: string, label: string) {
  const editor = page.locator('.home-address');
  await editor.getByRole('combobox', { name: 'Home address', exact: true }).fill(text);
  await editor.getByRole('button', { name: 'Find area', exact: true }).click();
  await editor.getByRole('option', { name: label, exact: true }).click();
  await editor.getByRole('button', { name: 'Save home address', exact: true }).click();
  await expect(editor.getByRole('status').filter({ hasText: 'Home address saved.' })).toBeVisible();
}

test('saved home autofills location search and clears on focus without deleting the saved address @smoke',async({page})=>{
 const state=await fixtures(page,home);
 await page.goto('/');
 await expect(page.getByRole('button',{name:'Start search',exact:true})).toBeEnabled();
 const field=page.getByRole('combobox',{name:'Address or area'});
 await expect(field).toHaveValue(home.label);
 await field.click();
 await expect(field).toHaveValue('');
 // Clearing the input is not an account setting change or a new paid search.
 expect(state.locations).toHaveLength(0);
 expect(state.discoveries).toHaveLength(0);
 await page.getByRole('button',{name:'Search near saved home'}).click();
 expect(state.discoveries).toHaveLength(0);
 await page.getByRole('button',{name:'Start search',exact:true}).click();
 await expect(page.locator('.restaurant-card')).toHaveCount(1);
 expect(state.discoveries).toHaveLength(1);
});
test('home save stays private, explicit Start runs once, and reload restores without another source run @smoke', async ({ page }) => {
  const state = await fixtures(page, null, false);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Where do you.*love eating/ })).toBeVisible();
  await selectHome(page, 'Fixture home Waterloo', home.label);
  expect(state.locations).toEqual([{ homeAddress: home }]);
  expect(state.discoveries).toHaveLength(0);
  await page.getByRole('button', { name: 'Find my next meal', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Here.*what.*hearing/ })).toBeVisible();
  expect(state.tastes).toHaveLength(1);
  expect(state.tastes[0]).not.toHaveProperty('homeAddress');
  expect(JSON.stringify(state.tastes[0])).not.toContain(home.label);
  await page.getByRole('button', { name: /find somewhere/ }).click();
  expect(state.discoveries).toHaveLength(0);
  await page.getByRole('button', { name: 'Start search', exact: true }).click();
  await expect(page.locator('.restaurant-card')).toHaveCount(1);
  expect(state.discoveries).toHaveLength(1);
  expect(state.discoveries[0]).toMatchObject({ lat: home.lat, lng: home.lng });
  await page.reload();
  await expect(page.locator('.restaurant-card')).toHaveCount(1);
  await page.waitForTimeout(250);
  expect(state.discoveries).toHaveLength(1);
});

test('manual visit overrides home edits and clear until the next visit', async ({ page }) => {
  const state = await fixtures(page, home);
  await page.goto('/'); await page.getByRole('button', { name: 'Start search', exact: true }).click(); await expect(page.locator('.restaurant-card')).toHaveCount(1);
  await openAdjustSearch(page); await page.getByRole('button', { name: 'Change area', exact: true }).first().click();
  await page.getByRole('combobox', { name: 'Address or area', exact: true }).fill('Fixture visit');
  await page.getByRole('button', { name: 'Find area', exact: true }).click();
  await page.getByRole('option', { name: manual.label, exact: true }).click();
  await page.getByRole('button', { name: 'Start search', exact: true }).click();
  await expect.poll(() => state.discoveries.length).toBe(2);
  await page.getByRole('button', { name: 'Taste', exact: true }).click();
  await page.getByRole('button', { name: 'Change home address', exact: true }).click();
  await selectHome(page, 'Second fixture home', changedHome.label);
  await page.getByRole('button', { name: 'Explore', exact: true }).click();
  await expect(page.getByText(`Picked for you · ${manual.label}`, { exact: true })).toBeVisible();
  expect(state.discoveries.at(-1)).toMatchObject({ lat: manual.lat, lng: manual.lng });
  await page.getByRole('button', { name: 'Taste', exact: true }).click();
  await page.getByRole('button', { name: 'Clear home address', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Home address cleared.' })).toBeVisible();
  await page.getByRole('button', { name: 'Explore', exact: true }).click();
  await expect(page.getByText(`Picked for you · ${manual.label}`, { exact: true })).toBeVisible();
  expect(state.locations.at(-1)).toEqual({ homeAddress: null });
  await page.reload();
  await expect(page.getByText(`Picked for you · ${manual.label}`, { exact: true })).toBeVisible();
  expect(state.discoveries).toHaveLength(2);
});

test('food and cuisine filters submit independently and signals never become sliders', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = await fixtures(page, home);
  await page.goto('/'); await page.getByRole('button', { name: 'Start search', exact: true }).click(); await expect(page.locator('.restaurant-card')).toHaveCount(1);
  await openAdjustSearch(page); await page.getByRole('combobox', { name: 'Cuisine', exact: true }).selectOption('Korean');
  await openAdjustSearch(page); await page.getByRole('combobox', { name: 'Food type', exact: true }).selectOption('noodles');
  expect(state.discoveries).toHaveLength(1);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect.poll(() => state.discoveries.length).toBe(2);
  expect(state.discoveries.at(-1)).toMatchObject({ cuisine: 'Korean', foodType: 'noodles' });
  const card = page.locator('.restaurant-card').first();
  await expect(card.getByRole('img', { name: 'Food: 83 out of 100', exact: true })).toBeVisible();
  await expect(card.getByRole('img', { name: 'Value: 0 out of 100', exact: true })).toBeVisible();
  await expect(card.getByText('Unknown', { exact: true })).toHaveCount(3);
  await expect(page.getByRole('slider')).toHaveCount(0);
  await expect(card.locator('.restaurant-tags').getByText('Korean', { exact: true })).toBeVisible();
  await expect(card.locator('.restaurant-tags').getByText('Noodles', { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('home-insights-phone.png'), fullPage: true });
  const dimensions = await page.evaluate(() => ({ viewport: innerWidth, page: document.documentElement.scrollWidth }));
  expect(dimensions.page).toBeLessThanOrEqual(dimensions.viewport);
});

test('skip link stays clipped until keyboard focus, then appears at the viewport top', async ({ page }) => {
  await fixtures(page, home); await page.goto('/'); await page.getByRole('button', { name: 'Start search', exact: true }).click(); await expect(page.locator('.restaurant-card')).toHaveCount(1);
  const skip = page.getByRole('link', { name: 'Skip to content', exact: true });
  expect(await skip.evaluate(element => getComputedStyle(element).clipPath)).toBe('inset(50%)');
  await page.getByRole('link', { name: 'East Eats home', exact: true }).focus();
  await page.keyboard.press('Shift+Tab'); await expect(skip).toBeFocused();
  expect(await skip.evaluate(element => getComputedStyle(element).clipPath)).toBe('none');
  const bounds = await skip.boundingBox(); expect(bounds?.y).toBe(8);
  await page.keyboard.press('Tab');
  expect(await skip.evaluate(element => getComputedStyle(element).clipPath)).toBe('inset(50%)');
});

test('GPS is requested only by action and overrides home for this visit without saving it', async ({ page }) => {
  await page.addInitScript(() => {
    const gps = { calls: 0, complete: () => {} };
    Object.assign(window, { fixtureGPS: gps });
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: (success: PositionCallback) => {
      gps.calls += 1;
      gps.complete = () => success({ coords: { latitude: 49.27, longitude: -122.8 } } as GeolocationPosition);
    } } });
  });
  const state = await fixtures(page, home);
  await page.goto('/'); await page.getByRole('button', { name: 'Start search', exact: true }).click(); await expect(page.locator('.restaurant-card')).toHaveCount(1);
  const gpsCalls = () => page.evaluate(() => (window as unknown as { fixtureGPS: { calls: number } }).fixtureGPS.calls);
  expect(await gpsCalls()).toBe(0);
  await page.getByRole('button', { name: 'Taste', exact: true }).click();
  await page.getByRole('button', { name: 'Use my current location', exact: true }).click();
  expect(await gpsCalls()).toBe(1);
  await page.evaluate(() => (window as unknown as { fixtureGPS: { complete: () => void } }).fixtureGPS.complete());
  await expect(page.getByRole('status').filter({ hasText: 'Current location is ready for your next search.' })).toBeVisible();
  expect(state.discoveries).toHaveLength(1);
  expect(state.locations).toHaveLength(0);
  await page.getByRole('button', { name: 'Explore', exact: true }).click();
  expect(state.discoveries).toHaveLength(1);
  await page.getByRole('button', { name: 'Start search', exact: true }).click();
  await expect.poll(() => state.discoveries.length).toBe(2);
  expect(state.discoveries.at(-1)).toMatchObject({ lat: 49.27, lng: -122.8 });
  await page.reload(); await expect(page.locator('.restaurant-card')).toHaveCount(1);
  expect(state.discoveries).toHaveLength(2);
  expect(state.discoveries.at(-1)).toMatchObject({ lat: 49.27, lng: -122.8 });
});

test('a late noodle specialist moves ahead in a filtered search while every matching map pin remains', async ({ page }) => {
  await fixtures(page, home);
  const broad = { ...ranked, restaurant: { ...restaurant, id: 'fixture-incidental', name: 'Fixture Incidental Review' } };
  const specialist = { ...ranked, restaurant: { ...restaurant, id: 'fixture-specialist', name: 'Fixture Noodle Specialist', lat: 43.525 } };
  const job = { id: 'fixture-relevance-job', kind: 'discovery', createdAt: '2026-10-28T00:00:00Z' };
  let updates = 0, polls = 0;
  const searchIds: string[] = [];
  await page.route('**/api/discover', route => {
    const input = route.request().postDataJSON() as DiscoverInput;
    if (!input.foodType) return route.fulfill({ json: { items: [broad], job: null, profileVersion: 1, dataMode: 'live', refreshing: false } });
    updates += 1; searchIds.push(input.searchId!);
    return route.fulfill({ json: { items: updates === 1 ? [broad] : [specialist, broad], job: { ...job, status: updates === 1 ? 'running' : 'succeeded' }, profileVersion: 1, dataMode: 'live', refreshing: updates === 1 } });
  });
  await page.route(`**/api/jobs/${job.id}`, route => { polls += 1; return route.fulfill({ json: { job: { ...job, status: polls >= 3 ? 'succeeded' : 'running' } } }); });
  await page.goto('/'); await page.getByRole('button', { name: 'Start search', exact: true }).click(); await expect(page.locator('.restaurant-title').first()).toHaveText('Fixture Incidental Review');
  await page.clock.install();
  await openAdjustSearch(page); await page.getByRole('combobox', { name: 'Food type', exact: true }).selectOption('noodles');
  expect(updates).toBe(0);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect.poll(() => updates).toBe(1);
  for (let count = 1; count <= 3; count++) { await page.clock.fastForward(3100); await expect.poll(() => polls).toBe(count); }
  await expect(page.locator('.restaurant-title').first()).toHaveText('Fixture Noodle Specialist');
  await expect(page.locator('.restaurant-card')).toHaveCount(2);
  await expect(page.locator('.map-locations button')).toHaveCount(2);
  await expect(page.locator('.map-locations button').filter({ hasText: 'Fixture Noodle Specialist' })).toHaveCount(1);
  await expect(page.locator('.map-locations button').filter({ hasText: 'Fixture Incidental Review' })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Fresh details are ready. Update results' })).toHaveCount(0);
  expect(new Set(searchIds).size).toBe(1);
});
