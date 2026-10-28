import { test, expect, type Page } from '@playwright/test';
import type { DiscoverInput, SavedLocation, TasteInput } from '../../src/lib/contracts';

// All businesses, review excerpts and addresses below are browser fixtures.
const home = { label: 'Fixture home, Waterloo, ON', lat: 43.52, lng: -80.52 };
const changedHome = { label: 'Second fixture home, Toronto, ON', lat: 43.65, lng: -79.38 };
const manual = { label: 'Fixture visit, Coquitlam, BC', lat: 49.25, lng: -122.79 };
const profile = { version: 1, weights: { food: .35, taste: .3, value: .15, proximity: .1, service: .05, atmosphere: .05 }, cuisines: ['Korean'], dishes: ['Noodles'], flavors: [], spicePreference: null, fusionPreference: null, interpretation: 'Fixture taste profile.', updatedAt: '2026-10-28T00:00:00Z' };
const answers: TasteInput = { favorites: [{ restaurantId: 'fixture-favorite', name: 'Fixture favorite', city: 'Waterloo', reasons: ['The food itself'], notes: '' }], goal: 'balanced' };
const restaurant = { id: 'fixture-noodle-house', name: 'Fixture Noodle House', address: 'Fixture restaurant address', city: 'Waterloo', cuisines: ['Korean'], lat: 43.521, lng: -80.52, priceLevel: 2, googleRating: 3.5, reviewCount: 50, sourceUrl: 'https://example.test/place', imageUrl: null, websiteUrl: null, hours: [], isClosed: false, fetchedAt: '2026-10-28T00:00:00Z', features: { foodQuality: .83, value: null, service: null, atmosphere: null, cuisines: ['Korean'], dishes: ['Noodles'], flavors: [], spice: null, fusion: false, reviewCount: 8, confidence: .7, evidence: [{ id: 'fixture-food-review', aspect: 'food', text: 'Fixture noodles have good texture.', sourceUrl: 'https://example.test/review' }], updatedAt: '2026-10-28T00:00:00Z' } };
const ranked = { restaurant, score: 65, distanceKm: 1, confidence: .7, explanation: 'Fixture context.', matchReasons: ['Your favorite mentions noodles; this place lists noodles.'], scoreBreakdown: { food: 83, value: null, service: null, atmosphere: null, taste: null } };

async function fixtures(page: Page, initialHome: SavedLocation | null, completed = true) {
  let savedHome = initialHome, ready = completed;
  const discoveries: DiscoverInput[] = [], locations: unknown[] = [], tastes: TasteInput[] = [];
  await page.route('**/api/session', route => route.fulfill({ json: { user: { id: 'fixture-home-user' }, configured: true, demo: false, dataMode: 'live', profile: ready ? profile : null, answers, homeAddress: savedHome } }));
  await page.route('**/api/saved', route => route.fulfill({ json: { items: [] } }));
  await page.route('**/api/location', route => { locations.push(route.request().postDataJSON()); savedHome = route.request().postDataJSON().homeAddress; return route.fulfill({ json: { homeAddress: savedHome } }); });
  await page.route('**/api/geocode', route => { const query = route.request().postDataJSON().query as string; return route.fulfill({ json: { items: query.includes('Second') ? [changedHome] : query.includes('visit') ? [manual] : [home] } }); });
  await page.route('**/api/taste', route => { tastes.push(route.request().postDataJSON()); ready = true; return route.fulfill({ json: { profile, personalized: true } }); });
  await page.route('**/api/discover', route => { discoveries.push(route.request().postDataJSON()); return route.fulfill({ json: { items: [ranked], job: null, refreshing: false, profileVersion: 1, dataMode: 'live' } }); });
  return { discoveries, locations, tastes };
}
async function selectHome(page: Page, text: string, label: string) {
  const editor = page.locator('.home-address');
  await editor.getByRole('combobox', { name: 'Home address', exact: true }).fill(text);
  await editor.getByRole('button', { name: 'Find area', exact: true }).click();
  await editor.getByRole('option', { name: label, exact: true }).click();
  await editor.getByRole('button', { name: 'Save home address', exact: true }).click();
  await expect(editor.getByRole('status').filter({ hasText: 'Home address saved.' })).toBeVisible();
}

test('home save is private, waits for onboarding, and becomes one initial search per visit', async ({ page }) => {
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
  await expect(page.locator('.restaurant-card')).toHaveCount(1);
  expect(state.discoveries).toHaveLength(1);
  expect(state.discoveries[0]).toMatchObject({ lat: home.lat, lng: home.lng });
  await page.reload();
  await expect(page.locator('.restaurant-card')).toHaveCount(1);
  await expect.poll(() => state.discoveries.length).toBe(2);
  await page.waitForTimeout(250);
  expect(state.discoveries).toHaveLength(2);
});

test('manual visit overrides home edits and clear until the next visit', async ({ page }) => {
  const state = await fixtures(page, home);
  await page.goto('/'); await expect(page.locator('.restaurant-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Change area', exact: true }).first().click();
  await page.getByRole('combobox', { name: 'Address or area', exact: true }).fill('Fixture visit');
  await page.getByRole('button', { name: 'Find area', exact: true }).click();
  await page.getByRole('option', { name: manual.label, exact: true }).click();
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
  await expect(page.getByRole('heading', { name: /Where are.*we eating/ })).toBeVisible();
});

test('food and cuisine filters submit independently and signals never become sliders', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = await fixtures(page, home);
  await page.goto('/'); await expect(page.locator('.restaurant-card')).toHaveCount(1);
  await page.getByRole('combobox', { name: 'Cuisine', exact: true }).selectOption('Korean');
  await page.getByRole('combobox', { name: 'Food type', exact: true }).selectOption('noodles');
  await expect.poll(() => state.discoveries.length).toBe(3);
  expect(state.discoveries.at(-1)).toMatchObject({ cuisine: 'Korean', foodType: 'noodles' });
  const card = page.locator('.restaurant-card').first();
  await expect(card.getByRole('heading', { name: 'Why this place', exact: true })).toBeVisible();
  await card.locator('summary').click();
  await expect(card.getByRole('meter', { name: 'Food review signal' })).toHaveAttribute('aria-valuenow', '83');
  await expect(card.getByText('Unknown', { exact: true })).toHaveCount(4);
  await expect(page.getByRole('slider')).toHaveCount(0);
  await expect(card.locator('.restaurant-tags').getByText('Korean', { exact: true })).toBeVisible();
  await expect(card.locator('.restaurant-tags').getByText('Noodles', { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('home-insights-phone.png'), fullPage: true });
  const dimensions = await page.evaluate(() => ({ viewport: innerWidth, page: document.documentElement.scrollWidth }));
  expect(dimensions.page).toBeLessThanOrEqual(dimensions.viewport);
});

test('skip link stays clipped until keyboard focus, then appears at the viewport top', async ({ page }) => {
  await fixtures(page, home); await page.goto('/'); await expect(page.locator('.restaurant-card')).toHaveCount(1);
  const skip = page.getByRole('link', { name: 'Skip to content', exact: true });
  expect(await skip.evaluate(element => getComputedStyle(element).clipPath)).toBe('inset(50%)');
  await page.keyboard.press('Tab'); await expect(skip).toBeFocused();
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
  await page.goto('/'); await expect(page.locator('.restaurant-card')).toHaveCount(1);
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
  await expect.poll(() => state.discoveries.length).toBe(2);
  expect(state.discoveries.at(-1)).toMatchObject({ lat: 49.27, lng: -122.8 });
  await page.reload(); await expect(page.locator('.restaurant-card')).toHaveCount(1);
  await expect.poll(() => state.discoveries.length).toBe(3);
  expect(state.discoveries.at(-1)).toMatchObject({ lat: home.lat, lng: home.lng });
});
