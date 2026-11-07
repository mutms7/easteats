import { test, expect } from '@playwright/test';
import { fixtureHome, fixturePlace, searchFixtures } from './search-fixtures';

for (const width of [375, 1440]) {
  test(`loading screen cycles messages then slides out for first results at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 812 });
    await searchFixtures(page, []);
    let finish: (() => void) | undefined;
    await page.route('**/api/discover', async route => {
      await new Promise<void>(resolve => { finish = resolve; });
      await route.fulfill({ json: { items: [fixturePlace()], refreshing: true, job: { id: 'partial', status: 'running', kind: 'discovery', createdAt: new Date().toISOString() }, profileVersion: 1, dataMode: 'live' } });
    });
    await page.route('**/api/jobs/*', route => route.fulfill({ json: { job: { id: 'partial', status: 'running' } } }));
    await page.goto('/');
    await page.clock.install();
    await page.getByRole('button', { name: 'Start search', exact: true }).click();
    const loading = page.locator('.search-loading-screen');
    await expect(loading).toHaveClass(/is-showing/);
    await expect(loading).toBeFocused();
    await expect(loading).toHaveCSS('animation-name', 'search-screen-in');
    await expect(page.getByRole('heading', { name: 'What’s in store for you today?' })).toBeVisible();
    await page.clock.runFor(500);
    await page.clock.fastForward(4600);
    await page.clock.runFor(500);
    await expect(page.getByRole('heading', { name: 'Flavour awaits!' })).toBeVisible();
    await expect(page.locator('.noodle-chopsticks')).toHaveCSS('animation-name', 'noodle-stir');
    await expect(loading).toHaveCSS('opacity', '1');
    await expect(page.locator('.search-loading-message')).toHaveCSS('opacity', '1');
    await page.screenshot({ path: testInfo.outputPath(`loading-${width}.png`), animations: 'disabled' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect.poll(() => Boolean(finish)).toBe(true);
    finish!();
    await expect(page.locator('.restaurant-card')).toHaveCount(1);
    await expect(loading).toHaveClass(/is-leaving/);
    await expect(loading).toHaveAttribute('aria-hidden', 'true');
    await page.clock.fastForward(400);
    await expect(loading).toHaveCount(0);
    await expect(page.locator('.search-spinner')).toBeVisible();
  });
}

test('Keep browsing does not stop the search, and the next search can show its loading screen', async ({ page }) => {
  const state = await searchFixtures(page, []);
  await page.route('**/api/discover', route => { state.discover.push(route.request().postDataJSON()); return route.fulfill({ json: { items: [], refreshing: true, job: { id: 'pending', status: 'running', kind: 'discovery', createdAt: new Date().toISOString() }, profileVersion: 1, dataMode: 'live' } }); });
  await page.route('**/api/jobs/*', route => route.fulfill({ json: { job: { id: 'pending', status: 'running' } } }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Start search', exact: true }).click();
  await page.getByRole('button', { name: 'Keep browsing' }).click();
  await expect(page.locator('.search-loading-screen')).toHaveCount(0);
  await expect(page.locator('.search-spinner')).toBeVisible();
  await page.getByRole('button', { name: 'New search', exact: true }).click();
  await page.getByRole('button', { name: 'Start search', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Keep browsing' })).toBeVisible();
  expect(state.discover).toHaveLength(2);
});

test('empty and failed searches stop the loading screen instead of leaving it up forever', async ({ page }) => {
  await searchFixtures(page, []);
  let finish: (() => void) | undefined;
  await page.route('**/api/discover', async route => {
    await new Promise<void>(resolve => { finish = resolve; });
    await route.fulfill({ status: 503, json: { error: 'The search could not finish.' } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Start search', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Keep browsing' })).toBeVisible();
  finish!();
  await expect(page.locator('.search-loading-screen')).toHaveCount(0);
  await expect(page.getByRole('alert').filter({ hasText: 'The search could not finish.' })).toBeVisible();
  await page.route('**/api/discover', route => route.fulfill({ json: { items: [], job: null, refreshing: false, profileVersion: 1, dataMode: 'live' } }));
  await page.getByRole('button', { name: 'New search', exact: true }).click();
  await page.getByRole('button', { name: 'Start search', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No matching places found' })).toBeVisible();
  await expect(page.locator('.search-loading-screen')).toHaveCount(0);
});

test('reduced motion keeps loading artwork still and Escape lets people browse', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await searchFixtures(page, []);
  await page.route('**/api/discover', route => route.fulfill({ json: { items: [], refreshing: true, job: { id: 'pending', status: 'running', kind: 'discovery', createdAt: new Date().toISOString() }, profileVersion: 1, dataMode: 'live' } }));
  await page.route('**/api/jobs/*', route => route.fulfill({ json: { job: { id: 'pending', status: 'running' } } }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Start search', exact: true }).click();
  await expect(page.locator('.search-loading-screen')).toHaveCSS('animation-name', 'none');
  await expect(page.locator('.noodle-chopsticks')).toHaveCSS('animation-name', 'none');
  await page.keyboard.press('Escape');
  await expect(page.locator('.search-loading-screen')).toHaveCount(0);
});

test('returning users edit their tastes together and failed saves keep the editor drafts', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const state = await searchFixtures(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Taste', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your taste preferences' })).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Signup progress' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Next', exact: true })).toHaveCount(0);
  await expect(page.locator('.taste-add-favorite')).not.toHaveAttribute('open', '');
  await page.getByText('Add a favourite restaurant', { exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Restaurant name' })).toBeVisible();
  await page.getByText('Add a favourite restaurant', { exact: true }).click();
  await expect(page.getByRole('group', { name: 'Fixture favorite', exact: true })).toBeVisible();
  await expect(page.getByRole('group', { name: 'What matters most right now?' })).toBeVisible();
  await page.getByRole('textbox', { name: /Tell us more/ }).fill('Chewy noodles and good value.');
  await page.getByRole('radio', { name: 'Great value', exact: true }).check();
  await page.route('**/api/taste', route => route.fulfill({ status: 503, json: { error: 'Please retry your taste update.' } }));
  await page.getByRole('button', { name: 'Save taste preferences' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Please retry' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: /Tell us more/ })).toHaveValue('Chewy noodles and good value.');
  await page.unroute('**/api/taste');
  // Restore the successful fixture after removing the temporary failure route.
  await page.route('**/api/taste', route => { state.tastes.push(route.request().postDataJSON()); return route.fulfill({ json: { profile: { version: 2 }, personalized: true } }); });
  await page.getByRole('button', { name: 'Save taste preferences' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Taste preferences saved.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your taste preferences' })).toBeVisible();
  expect(state.tastes[0].goal).toBe('value');
  expect(state.tastes[0].favorites[0].notes).toBe('Chewy noodles and good value.');
  await page.screenshot({ path: testInfo.outputPath('taste-editor-phone.png'), fullPage: true });
  await page.getByRole('button', { name: 'Back to exploring' }).click();
  await expect(page.getByRole('heading', { name: 'Fixture noodle night' })).toBeVisible();
  expect(state.discover).toHaveLength(0);
});
