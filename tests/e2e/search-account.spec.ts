import { goToQuizStep } from './quiz-helpers';
import { test, expect } from '@playwright/test';
import { fixtureHome, fixtureSearch, searchFixtures } from './search-fixtures';

test('account is accessible before onboarding and before searching, saves details and preserves failed drafts', async ({ page }) => {
  await searchFixtures(page, [], false);
  let fail = true;
  const writes: unknown[] = [];
  await page.route('**/api/account', route => {
    const input = route.request().postDataJSON(); writes.push(input);
    return route.fulfill(fail ? { status: 503, json: { error: 'Account details could not be saved. Please retry.' } } : { json: { user: { id: 'fixture-search-user', name: input.name, email: input.email }, message: 'Account details saved.' } });
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Where should we look near home?' })).toBeVisible();
  await page.getByRole('button', { name: 'Account', exact: true }).click();
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Fixture diner');
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill('fixture@example.invalid');
  await page.getByRole('button', { name: 'Save account details' }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('could not be saved');
  await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue('Fixture diner');
  fail = false;
  await page.getByRole('button', { name: 'Save account details' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Account details saved.' })).toBeVisible();
  expect(writes).toHaveLength(2);
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Where should we look near home?' })).toBeVisible();
  await goToQuizStep(page, 3);
  await page.getByRole('button', { name: 'Find my next meal', exact: true }).click();
  await page.getByRole('button', { name: /find somewhere/ }).click();
  await page.getByRole('button', { name: 'Account', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue('Fixture diner');
});

test('editing home from the search screen updates the default, and a new search always resets to it', async ({ page }) => {
  const state = await searchFixtures(page, []);
  const changed = { label: 'Second fixture home, Toronto', lat: 43.65, lng: -79.38 };
  await page.route('**/api/geocode', route => route.fulfill({ json: { items: [changed] } }));
  await page.goto('/'); await expect(page.getByRole('button', { name: 'Start search', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Account', exact: true }).click();
  await page.getByRole('button', { name: 'Change home address' }).click();
  await page.getByRole('combobox', { name: 'Home address', exact: true }).fill('Second fixture');
  await page.getByRole('button', { name: 'Find area', exact: true }).click();
  await page.getByRole('option', { name: changed.label, exact: true }).click();
  await page.getByRole('button', { name: 'Save home address', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Home address saved.' })).toBeVisible();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  const field = page.getByRole('combobox', { name: 'Address or area' });
  await expect(field).toHaveValue(changed.label);
  await field.focus(); await expect(field).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Start search', exact: true })).toBeDisabled();
  await field.fill('Different visit draft');
  await page.getByRole('button', { name: 'Account', exact: true }).click();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(field).toHaveValue('Different visit draft');
  await expect(page.getByRole('button', { name: 'Start search', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'New search', exact: true }).click();
  await expect(field).toHaveValue(changed.label);
  await page.getByRole('button', { name: 'Start search', exact: true }).click();
  await expect.poll(() => state.discover.length).toBe(1);
  expect(state.discover[0]).toMatchObject({ lat: changed.lat, lng: changed.lng });
  expect(state.locations).toEqual([{ homeAddress: changed }]);
});

test('Find area resolves a prefilled home without clearing it on programmatic focus', async ({ page }) => {
  const state = await searchFixtures(page, []);
  await page.goto('/');
  await page.getByRole('button', { name: 'Find area', exact: true }).click();
  await expect(page.getByRole('option', { name: fixtureHome.label })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Address or area' })).toHaveValue(fixtureHome.label);
  expect(state.discover).toHaveLength(0);
});

test('an older history request cannot navigate away from Account', async ({ page }) => {
  const second = fixtureSearch('22222222-2222-4222-8222-222222222222', 'Delayed fixture search');
  await searchFixtures(page, [fixtureSearch(), second]);
  await page.goto('/'); await expect(page.locator('.restaurant-card')).toHaveCount(1);
  let release: () => void = () => {};
  let started = false;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route(`**/api/searches/${second.id}`, async route => {
    started = true; await held;
    await route.fulfill({ json: { search: second } }).catch(() => {});
  });
  await page.locator('.search-history-chip').filter({ hasText: second.title }).click();
  await expect.poll(() => started).toBe(true);
  await page.getByRole('button', { name: 'Account', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your account', exact: true })).toBeVisible();
  release(); await page.waitForTimeout(100);
  await expect(page.getByRole('heading', { name: 'Your account', exact: true })).toBeVisible();
});

for (const viewport of [{ width: 375, height: 812 }, { width: 390, height: 844 }, { width: 1440, height: 900 }]) {
  test(`search controls fit at ${viewport.width}x${viewport.height}, with every history item accessible`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    const searches = Array.from({ length: 9 }, (_, i) => fixtureSearch(`11111111-1111-4111-8111-${String(i).padStart(12, '0')}`, `Fixture search ${i + 1}`));
    await searchFixtures(page, searches);
    await page.goto('/'); await expect(page.locator('.restaurant-card')).toHaveCount(1);
    await page.getByRole('button', { name: 'New search', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Where are we eating?' })).toBeVisible();
    await expect(page.locator('.search-history-chip')).toHaveCount(9);
    const start = (await page.getByRole('button', { name: 'Start search', exact: true }).boundingBox())!;
    expect(start.y + start.height).toBeLessThanOrEqual(viewport.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    const gps = page.getByRole('button', { name: 'Use my location', exact: true });
    const find = page.getByRole('button', { name: 'Find area', exact: true });
    expect(await gps.evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(255, 255, 255)');
    expect(await find.evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe('rgb(255, 255, 255)');
    await page.screenshot({ path: testInfo.outputPath('compact-search.png'), fullPage: true });
    await page.locator('.search-history-chip').last().focus(); await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Fixture search 9', exact: true })).toBeVisible();
  });
}

test('a search remains usable at enlarged text sizes and on a short phone', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await searchFixtures(page, []); await page.goto('/');
  await page.addStyleTag({ content: 'html { font-size: 200%; }' });
  await expect(page.getByRole('button', { name: 'Start search', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Start search', exact: true }).click();
  await expect(page.locator('.restaurant-card')).toHaveCount(1);
});
