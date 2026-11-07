import { expect, test, type Page } from '@playwright/test';
import { fixtureAnswers, fixtureHome, fixturePlace, fixtureProfile, searchFixtures } from './search-fixtures';
import { goToQuizStep } from './quiz-helpers';

async function guidedFixtures(page: Page, completed = true) {
  const state = await searchFixtures(page, [], completed);
  state.home = null;
  let dismissed = false;
  await page.route('**/api/session', route => route.fulfill({ json: {
    user: { id: 'guided-user' }, profile: state.ready ? fixtureProfile : null,
    answers: fixtureAnswers, homeAddress: state.home, tutorialCompleted: dismissed,
    dataMode: 'live', configured: true,
  } }));
  await page.route('**/api/tutorial', route => { dismissed = true; return route.fulfill({ json: { completed: true } }); });
  return { state, dismissed: () => dismissed };
}

test('tutorial waits until the questionnaire and profile confirmation are finished', async ({ page }) => {
  await guidedFixtures(page, false);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Where should we look near home?' })).toBeVisible();
  await expect(page.locator('.tutorial-coach')).toHaveCount(0);
  await goToQuizStep(page, 3);
  await page.getByRole('button', { name: 'Find my next meal', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Here’s what we’re hearing.' })).toBeVisible();
  await expect(page.locator('.tutorial-coach')).toHaveCount(0);
  await page.getByRole('button', { name: 'Let’s find somewhere', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Choose where to eat' })).toBeVisible();
});

for (const width of [375, 1440]) {
  test(`guide waits for actual inputs and search actions at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 812 });
    const fixture = await guidedFixtures(page);
    let finishSearch: (() => void) | undefined;
    await page.route('**/api/discover', async route => {
      fixture.state.discover.push(route.request().postDataJSON());
      await new Promise<void>(resolve => { finishSearch = resolve; });
      await route.fulfill({ json: { items: [fixturePlace()], job: null, refreshing: false, searchPhase: 'complete', profileVersion: 1, dataMode: 'live' } });
    });
    await page.goto('/');
    const guide = page.locator('.tutorial-coach');
    await expect(guide).toHaveAttribute('data-step', '0');
    await expect(guide.getByRole('button', { name: 'Skip tutorial' })).toHaveCount(0);
    const skip = page.getByRole('button', { name: 'Skip tutorial', exact: true });
    await expect(skip).toHaveCSS('position', 'fixed');
    const skipBox = await skip.boundingBox();
    expect(skipBox!.x).toBe(16);
    await expect(page.locator('.tutorial-click-cue')).toHaveCSS('pointer-events', 'none');
    await expect(page.getByRole('button', { name: 'Use this area' })).toBeDisabled();
    await expect(page.locator('.search-composer .location-search')).toHaveClass(/tutorial-target/);
    await page.getByRole('combobox', { name: 'Address or area' }).fill('Waterloo');
    await page.getByRole('option', { name: fixtureHome.label }).click();
    await page.getByRole('button', { name: 'Use this area' }).click();
    await expect(page.getByRole('button', { name: 'Use this craving' })).toBeDisabled();
    await page.getByRole('textbox', { name: /What are you craving/ }).fill('noodles');
    await expect(guide).toHaveAttribute('data-step', '1');
    await page.getByRole('button', { name: 'Use this craving' }).click();
    await expect(page.locator('.search-composer .filters')).toHaveClass(/tutorial-target/);
    await expect(guide).toBeInViewport();
    const targetBox = await page.locator('.search-composer .filters').boundingBox();
    const guideBox = await guide.boundingBox();
    expect(targetBox && guideBox && (guideBox.x >= targetBox.x + targetBox.width || guideBox.y >= targetBox.y + targetBox.height || guideBox.y + guideBox.height <= targetBox.y)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`guided-filters-${width}.png`) });
    await page.getByRole('button', { name: 'Keep these filters' }).click();
    await expect(guide).toContainText('Your first search may take up to a minute, flavor awaits!');
    const cueBox = await page.locator('.tutorial-click-cue').boundingBox();
    const startBox = await page.getByRole('button', { name: 'Start search', exact: true }).boundingBox();
    expect(cueBox!.x + 20).toBeCloseTo(startBox!.x + startBox!.width / 2, 0);
    await page.screenshot({ path: testInfo.outputPath(`click-cue-${width}.png`) });
    expect(fixture.state.discover).toHaveLength(0);
    await page.getByRole('button', { name: 'Start search', exact: true }).click();
    await expect(guide).toHaveAttribute('data-step', '4');
    await expect(guide).toContainText('Your first search may take up to a minute');
    await expect.poll(() => Boolean(finishSearch)).toBe(true);
    finishSearch!();
    await expect(guide).toHaveAttribute('data-step', '5');
    expect(fixture.dismissed()).toBe(false);
    await page.getByRole('button', { name: 'Fixture Noodle House', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(guide).toHaveAttribute('data-step', '6');
    await expect(page.locator('.detail-dialog .restaurant-actions')).toHaveClass(/tutorial-target/);
    await expect(guide).toContainText('Eat here records your meal choice');
    await expect(page.getByRole('dialog').getByRole('region', { name: 'Keep a place or choose your meal' })).toBeVisible();
    await expect(page.getByRole('dialog').getByRole('button', { name: 'Skip tutorial', exact: true })).toBeVisible();
    const back = page.getByRole('button', { name: 'Back to results', exact: true });
    for (let count = 0; count < 25 && !await back.evaluate(element => document.activeElement === element); count++) await page.keyboard.press('Tab');
    await expect(back).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(guide).toHaveAttribute('data-step', '7');
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toHaveClass(/tutorial-target/);
    await page.getByRole('button', { name: 'Finish tutorial' }).click();
    await expect(guide).toHaveCount(0);
    expect(fixture.dismissed()).toBe(true);
    await expect(page.locator('.tutorial-target')).toHaveCount(0);
    expect(fixture.state.discover).toHaveLength(1);
    expect(fixture.state.discover[0].query).toBe('noodles');
  });
}

test('skipping the craving keeps it optional and skipping the tour persists', async ({ page }) => {
  const fixture = await guidedFixtures(page);
  fixture.state.home = fixtureHome;
  await page.goto('/');
  await page.getByRole('button', { name: 'Use this area' }).click();
  await page.getByRole('textbox', { name: /What are you craving/ }).fill('noodles');
  await page.getByRole('button', { name: 'Show me everything' }).click();
  await expect(page.getByRole('textbox', { name: /What are you craving/ })).toHaveValue('');
  await page.getByRole('button', { name: 'Skip tutorial' }).click();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Where are we eating?' })).toBeVisible();
  await expect(page.locator('.tutorial-coach')).toHaveCount(0);
  expect(fixture.state.discover).toHaveLength(0);
});
