import { test, expect } from '@playwright/test';

test('account deletion needs confirmation and preserves the account on failure', async ({ page }) => {
  let deletes = 0;
  await page.route('**/api/session', route => route.fulfill({ json: { user: { id: 'delete-fixture', email: 'fixture@example.invalid' } } }));
  await page.route('**/api/account', route => {
    expect(route.request().method()).toBe('DELETE');
    expect(route.request().postDataJSON()).toEqual({ confirmation: 'DELETE' });
    deletes++;
    return route.fulfill({ status: 503, json: { error: 'Your account could not be deleted. Please sign in and try again.' } });
  });
  await page.goto('/delete-account');
  const remove = page.getByRole('button', { name: 'Delete my account', exact: true });
  await expect(remove).toBeDisabled();
  expect(deletes).toBe(0);
  await page.getByRole('checkbox').check();
  await remove.click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('could not be deleted');
  await expect(page.getByRole('heading', { name: 'Your account is deleted.' })).toHaveCount(0);
  expect(deletes).toBe(1);
});

test('privacy is public and account deletion offers a sign-in return path', async ({ page }) => {
  await page.goto('/privacy');
  await expect(page.getByRole('heading', { name: 'Where that information goes' })).toBeVisible();
  await page.route('**/api/session', route => route.fulfill({ json: { user: null } }));
  await page.goto('/delete-account');
  await expect(page.getByRole('link', { name: 'Sign in to delete your account' })).toHaveAttribute('href', '/auth/login?next=/delete-account');
  await expect(page.getByRole('button', { name: 'Delete my account', exact: true })).toHaveCount(0);
});
