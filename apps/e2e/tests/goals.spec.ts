import { expect, signIn, test } from './support';

test('a team goal is set from the dashboard and counts the week\'s leads', async ({ page, account }) => {
  await account.api('/leads', { body: { name: 'Goal Lead', phone: '01001112223', source: 'manual' } });
  await signIn(page, account);

  // The innermost section with the heading: the panel itself.
  const panel = page.locator('section', { has: page.getByRole('heading', { name: 'Goals', exact: true }) }).last();
  await panel.getByRole('button', { name: 'Set a goal' }).click();
  const sheet = page.getByRole('dialog');
  await sheet.locator('input[type=number]').fill('4');
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(sheet.getByText('New leads · this week')).toBeVisible();
  await sheet.getByRole('button', { name: 'Close' }).click();
  await expect(sheet).toHaveCount(0);

  await expect(panel.getByText('New leads · this week')).toBeVisible();
  await expect(panel.getByText('1 / 4')).toBeVisible();
  await expect(panel.getByText(/3 to go/)).toBeVisible();
});
