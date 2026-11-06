import { expect, type Page } from '@playwright/test';

export async function goToQuizStep(page: Page, target: number) {
  const quiz = page.locator('.taste-quiz');
  await expect(quiz).toBeVisible();
  for (let count = 0; count < 9; count++) {
    const progress = quiz.getByRole('progressbar', { name: 'Signup progress' });
    const current = Number(await progress.getAttribute('value')) - 1;
    if (current === target) return;
    await quiz.getByRole('button', { name: current > target ? 'Back' : /^(Next|Skip home address)$/, exact: true }).click();
    await expect(progress).toHaveAttribute('value', String(current + (current > target ? -1 : 1) + 1));
  }
  throw new Error(`Quiz did not reach step ${target}`);
}

export async function skipTutorial(page: Page) {
  const skip = page.getByRole('button', { name: 'Skip tutorial', exact: true });
  if (await skip.isVisible()) await skip.click();
}
