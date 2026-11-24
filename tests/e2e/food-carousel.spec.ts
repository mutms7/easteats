import { test, expect, type Page } from '@playwright/test';

const dishes = ['Sushi', 'Bibimbap', 'Korean fried chicken', 'Soup dumplings', 'Japanese ramen', 'Chow mein'];

// Step-by-step tests pause autoplay so it can't move a slide under them; autoplay has its own test.
async function open(page: Page, { holdStill = true } = {}) {
  await page.route('**/api/session', route => route.fulfill({ json: { user: null, configured: true, demo: false, dataMode: 'live', profile: null, answers: null, providers: { google: true, email: true } } }));
  await page.goto('/');
  const carousel = page.getByRole('region', { name: "What's calling your name?" });
  await carousel.scrollIntoViewIfNeeded();
  const reduced = await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  if (holdStill && !reduced) { await carousel.getByRole('button', { name: 'Pause slideshow' }).click(); await expect(carousel).toHaveAttribute('data-autoplay', 'false'); }
  return carousel;
}

// The current slide is the one centered in the track once scrolling settles.
async function expectCentered(page: Page, position: number) {
  const carousel = page.getByRole('region', { name: "What's calling your name?" });
  await expect(carousel).toHaveAttribute('data-index', String(position));
  const slide = carousel.getByRole('group', { name: `${position + 1} of ${dishes.length}: ${dishes[position]}` });
  await expect(slide).toHaveAttribute('data-current', 'true');
  await expect.poll(async () => {
    const track = await carousel.locator('.food-track').boundingBox(), box = await slide.boundingBox();
    return Math.abs(box!.x + box!.width / 2 - (track!.x + track!.width / 2));
  }).toBeLessThan(2);
}

test('food carousel shows the six dishes and moves by arrow, dot, keyboard and wrap', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const carousel = await open(page);
  for (const [position, name] of dishes.entries()) await expect(carousel.getByRole('group', { name: `${position + 1} of 6: ${name}` })).toHaveCount(1);
  await expectCentered(page, 0);
  const current = carousel.locator('.food-slide[data-current=true] img');
  await expect.poll(() => current.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  await carousel.getByRole('button', { name: 'Next dish' }).click();
  await expectCentered(page, 1);
  await carousel.getByRole('button', { name: 'Show Japanese ramen' }).click();
  await expectCentered(page, 4);
  await expect(carousel.getByRole('button', { name: 'Show Japanese ramen' })).toHaveAttribute('aria-current', 'true');
  await carousel.getByRole('button', { name: 'Next dish' }).focus();
  await page.keyboard.press('ArrowRight');
  await expectCentered(page, 5);
  await carousel.getByRole('button', { name: 'Next dish' }).click();
  await expectCentered(page, 0);
  await carousel.getByRole('button', { name: 'Previous dish' }).click();
  await expectCentered(page, 5);
  // Clicking a dimmed neighbour brings it to the middle.
  const neighbour = carousel.getByRole('group', { name: '5 of 6: Japanese ramen' });
  const box = await neighbour.boundingBox();
  await page.mouse.click(box!.x + box!.width - 40, box!.y + box!.height / 2);
  await expectCentered(page, 4);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test('food carousel loops forever in both directions, with a dish on each side at the ends', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const carousel = await open(page);
  const next = carousel.getByRole('button', { name: 'Next dish' }), previous = carousel.getByRole('button', { name: 'Previous dish' });
  // Two and a bit full laps forward, then back past the start.
  for (let step = 1; step <= 14; step++) { await next.click(); await expectCentered(page, step % 6); }
  for (let step = 13; step >= 0; step--) { await previous.click(); await expectCentered(page, (step + 6 * 3) % 6); }
  // Whichever dish is current, the track has a real photo on both sides of it, so there's never an end.
  for (const target of [0, 5]) {
    await carousel.getByRole('button', { name: `Show ${dishes[target]}` }).click();
    await expectCentered(page, target);
    const sides = await carousel.locator('.food-track').evaluate(element => {
      const current = element.querySelector('[data-current=true]') as HTMLElement, middle = element.clientWidth / 2 + element.getBoundingClientRect().x;
      const box = current.getBoundingClientRect();
      return [!!document.elementFromPoint(box.x - 60, box.y + box.height / 2)?.closest('.food-slide'), !!document.elementFromPoint(box.right + 60, box.y + box.height / 2)?.closest('.food-slide'), Math.abs(box.x + box.width / 2 - middle) < 2];
    });
    expect(sides).toEqual([true, true, true]);
  }
});

test('food carousel follows a mouse drag one dish at a time', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const carousel = await open(page);
  await expectCentered(page, 0);
  const track = await carousel.locator('.food-track').boundingBox();
  const y = track!.y + track!.height / 2, x = track!.x + track!.width / 2;
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x - 80, y, { steps: 6 }); await page.mouse.move(x - 160, y, { steps: 6 }); await page.mouse.up();
  await expectCentered(page, 1);
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 160, y, { steps: 10 }); await page.mouse.up();
  await expectCentered(page, 0);
});

test('food carousel advances on its own and can be paused', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const carousel = await open(page, { holdStill: false });
  await page.mouse.move(5, 5);
  await expect(carousel).toHaveAttribute('data-autoplay', 'true');
  await expect(carousel).toHaveAttribute('data-index', '1', { timeout: 6000 });
  await carousel.getByRole('button', { name: 'Pause slideshow' }).click();
  await page.mouse.move(5, 5);
  await expect(carousel).toHaveAttribute('data-autoplay', 'false');
  await expect(carousel.getByRole('button', { name: 'Play slideshow' })).toBeVisible();
  await page.waitForTimeout(4500);
  await expect(carousel).toHaveAttribute('data-index', '1');
});

test('food carousel swipes on a phone without widening the page', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  const carousel = await open(page);
  await expectCentered(page, 0);
  // A touch swipe is native horizontal scrolling; scroll the track the way a finger would.
  await carousel.locator('.food-track').evaluate(element => {
    const slide = element.querySelector('[aria-label="3 of 6: Korean fried chicken"]') as HTMLElement;
    element.scrollTo({ left: slide.offsetLeft + slide.offsetWidth / 2 - element.clientWidth / 2, behavior: 'instant' });
  });
  await expectCentered(page, 2);
  // Swiping on past the last dish lands on the first one again.
  await carousel.locator('.food-track').evaluate(element => {
    const last = element.querySelector('[aria-label="6 of 6: Chow mein"]') as HTMLElement, after = last.nextElementSibling as HTMLElement;
    element.scrollTo({ left: after.offsetLeft + after.offsetWidth / 2 - element.clientWidth / 2, behavior: 'instant' });
  });
  await expectCentered(page, 0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('with reduced motion the food carousel stays put but every control still works', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const carousel = await open(page);
  await expect(carousel).toHaveAttribute('data-autoplay', 'false');
  await expect(carousel.getByRole('button', { name: /slideshow/ })).toHaveCount(0);
  await carousel.getByRole('button', { name: 'Next dish' }).click();
  await expectCentered(page, 1);
});
