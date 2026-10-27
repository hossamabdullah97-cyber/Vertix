import { expect, signIn, test } from './support';

test('the confirm-your-email line can be put off for a while, and the account menu keeps the way to confirm', async ({ page, account }) => {
  await signIn(page, account);
  const line = page.getByRole('status').filter({ hasText: 'Confirm your email' });
  await expect(line).toBeVisible();
  await expect(line).toContainText('to invite your team and choose a plan.');

  await line.getByRole('button', { name: 'Remind me later' }).click();
  await expect(line).toHaveCount(0);
  await page.reload();
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('status').filter({ hasText: 'Confirm your email' })).toHaveCount(0);

  // Still one click away in the account menu.
  await page.getByRole('button', { name: /E2E Owner/ }).last().click();
  await expect(page.getByRole('menuitem', { name: 'Confirm your email' })).toBeVisible();
});
