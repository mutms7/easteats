import { test, expect, type Page } from '@playwright/test';

const signedOut = { user: null, configured: true, demo: false, dataMode: 'live', profile: null, answers: null };
// Baked pill in the 1280x720 master: x 491-788, y 455-520.
const BAKED = { x: 491 / 1280, y: 455 / 720, w: 298 / 1280, h: 66 / 720 };

async function open(page: Page, providers: { google: boolean; email: boolean }) {
  await page.route('**/api/session', route => route.fulfill({ json: { ...signedOut, providers } }));
  await page.goto('/');
  const promo = page.getByRole('region', { name: 'East Eats promo video' });
  await expect(promo).toBeVisible();
  return promo;
}

async function finish(page: Page) {
  const promo = page.getByRole('region', { name: 'East Eats promo video' });
  await page.locator('.promo-media').evaluate(async (element: HTMLVideoElement) => {
    if (element.readyState < 1) await new Promise(resolve => element.addEventListener('loadedmetadata', resolve, { once: true }));
    element.currentTime = Math.max(0, element.duration - 0.4);
    await element.play().catch(() => undefined);
  });
  await expect(promo).toHaveAttribute('data-state', 'ended', { timeout: 10000 });
  return promo;
}

async function expectOnBakedPill(page: Page) {
  const cta = page.getByRole('link', { name: 'Try East Eats free' });
  await expect(cta).toBeVisible();
  const frame = await page.locator('.promo-media').boundingBox(), box = await cta.boundingBox();
  expect(Math.abs(box!.x - (frame!.x + frame!.width * BAKED.x))).toBeLessThan(1.5);
  expect(Math.abs(box!.y - (frame!.y + frame!.height * BAKED.y))).toBeLessThan(1.5);
  expect(Math.abs(box!.width - frame!.width * BAKED.w)).toBeLessThan(1.5);
  expect(Math.abs(box!.height - frame!.height * BAKED.h)).toBeLessThan(1.5);
  expect(await cta.evaluate(element => { const r = element.getBoundingClientRect(); return element.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); })).toBe(true);
  return cta;
}

for (const viewport of [{ width: 375, height: 667 }, { width: 1440, height: 900 }]) {
  test(`promo autoplays muted and its end button opens email sign-up at ${viewport.width}px${viewport.width === 375 ? ' @smoke' : ''}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const promo = await open(page, { google: true, email: true });
    await expect(promo).toHaveAttribute('data-state', 'playing');
    expect(await page.locator('.promo-media').evaluate((element: HTMLVideoElement) => element.muted)).toBe(true);
    await expect(page.getByRole('link', { name: 'Try East Eats free' })).toHaveCount(0);
    await expect(promo.getByRole('button', { name: 'Pause promo video' })).toBeVisible();
    await finish(page);
    await expect(promo.getByRole('button', { name: 'Replay promo video' })).toBeVisible();
    const cta = await expectOnBakedPill(page);
    await cta.click();
    await expect(page.getByLabel('Name', { exact: true })).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('promo end button goes to Google sign-in when email accounts are off', async ({ page }) => {
  await page.route('**/auth/login', route => route.fulfill({ contentType: 'text/html', body: '<title>google</title>' }));
  await open(page, { google: true, email: false });
  await finish(page);
  await (await expectOnBakedPill(page)).click();
  await expect(page).toHaveURL(/\/auth\/login$/);
});

test('promo controls pause, unmute and replay, and the button can be reached by keyboard', async ({ page }) => {
  const promo = await open(page, { google: true, email: true });
  await expect(promo).toHaveAttribute('data-state', 'playing');
  await promo.getByRole('button', { name: 'Pause promo video' }).click();
  await expect(promo).toHaveAttribute('data-state', 'paused');
  const sound = promo.getByRole('button', { name: 'Turn promo sound on' });
  await sound.click();
  await expect(promo.getByRole('button', { name: 'Turn promo sound off' })).toHaveAttribute('aria-pressed', 'true');
  expect(await page.locator('.promo-media').evaluate((element: HTMLVideoElement) => element.muted)).toBe(false);
  await finish(page);
  const cta = page.getByRole('link', { name: 'Try East Eats free' });
  await cta.focus();await page.keyboard.press('Enter');
  await expect(page.getByLabel('Name', { exact: true })).toBeFocused();
  await promo.getByRole('button', { name: 'Replay promo video' }).click();
  await expect(promo).toHaveAttribute('data-state', 'playing');
  await expect(cta).toHaveCount(0);
});

test('with reduced motion the promo rests on its end card with a working button', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const promo = await open(page, { google: true, email: true });
  await expect(promo).toHaveAttribute('data-reduced-motion', 'true');
  await expect(promo).toHaveAttribute('data-state', 'paused');
  await expect(page.locator('.promo-media')).toHaveAttribute('poster', '/videos/east-eats-promo-end.jpg');
  await (await expectOnBakedPill(page)).click();
  await expect(page.getByLabel('Name', { exact: true })).toBeFocused();
});
