import { test, expect } from '@playwright/test';
import { fixturePlace, searchFixtures } from './search-fixtures';

test('playback icons and button size stay consistent through pause, play, and replay', async ({ page }) => {
  await page.route('**/api/session', route => route.fulfill({ json: { user: null, configured: true, profile: null } }));
  await page.goto('/');
  const controls = page.getByRole('group', { name: 'Introduction playback controls' });
  await expect(controls).toHaveCSS('border-top-width', '0px');
  const button = controls.getByRole('button');
  const sizes: number[][] = [];
  for (const state of ['Pause introduction', 'Play introduction', 'Pause introduction']) {
    await expect(button).toHaveAccessibleName(state);
    await expect(button.locator('svg')).toHaveCount(1);
    const box = await button.boundingBox(); sizes.push([box!.width, box!.height]);
    await button.click();
  }
  await page.getByRole('slider', { name: 'Introduction playback position' }).fill('28000');
  await expect(button).toHaveAccessibleName('Replay introduction');
  const box = await button.boundingBox(); sizes.push([box!.width, box!.height]);
  expect(sizes.every(size => size[0] === sizes[0][0] && size[1] === sizes[0][1])).toBe(true);
});

test('saved collection has space before Back to your search', async ({ page }) => {
  await searchFixtures(page);
  await page.route('**/api/saved', route => route.fulfill({ json: { items: [fixturePlace().restaurant] } }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Saved (1)', exact: true }).click();
  const grid = await page.locator('.saved-grid').boundingBox();
  const button = await page.getByRole('button', { name: 'Back to your search', exact: true }).boundingBox();
  expect(button!.y - (grid!.y + grid!.height)).toBeGreaterThanOrEqual(30);
});

for (const width of [375, 1440]) {
  test(`Questions page has useful answers and email links at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 812 });
    await page.goto('/questions');
    await expect(page.getByRole('heading', { name: 'Questions? I’m listening.' })).toBeVisible();
    await expect(page.locator('#search-time')).toHaveAttribute('open', '');
    await expect(page.locator('#why-the-wait')).toHaveAttribute('open', '');
    await expect(page.locator('#search-time')).toContainText('some searches take longer');
    await expect(page.locator('#why-the-wait')).toContainText('review text');
    for (const [label, subject] of [['Send feedback', 'feedback'], ['Ask a question', 'question'], ['Request a feature', 'feature request']]) {
      const link = page.locator('#contact').getByRole('link', { name: label, exact: true });
      await expect(link).toHaveAttribute('href', `mailto:chenyinwilliam@gmail.com?subject=${encodeURIComponent(`EastEats ${subject}`)}`);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('link', { name: 'Back to EastEats' }).click();
    await expect(page).toHaveURL(/\/$/);
  });
}

test('search status links to Questions in another tab while search remains running', async ({ page }) => {
  await searchFixtures(page, []);
  await page.route('**/api/discover', route => route.fulfill({ json: { items: [], refreshing: true, job: { id: 'still-searching', kind: 'discovery', status: 'running', createdAt: new Date().toISOString() }, profileVersion: 1, dataMode: 'live' } }));
  await page.route('**/api/jobs/*', route => route.fulfill({ json: { job: { id: 'still-searching', status: 'running' } } }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Start search', exact: true }).click();
  await page.getByRole('button', { name: 'Keep browsing' }).click();
  const status = page.getByRole('status').filter({ hasText: 'Searching Google Maps for places' });
  await expect(status).toContainText('Results and map pins appear as they arrive. Questions?');
  const popup = page.waitForEvent('popup');
  await status.getByRole('link', { name: 'Questions?' }).click();
  const help = await popup;
  await expect(help.getByRole('heading', { name: 'Questions? I’m listening.' })).toBeVisible();
  await expect(page.locator('.search-spinner')).toBeVisible();
  await expect(page.locator('.restaurant-list')).toHaveAttribute('aria-busy', 'true');
});
