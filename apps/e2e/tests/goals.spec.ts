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

test('a goal reached is celebrated with the team, once', async ({ page, account }) => {
  await account.api('/leads', { body: { name: 'Goal Reacher', phone: '01001112299', source: 'manual' } });
  await account.api('/goals', { method: 'PUT', body: { metric: 'LEADS', period: 'WEEK', scope: 'TEAM', target: 1 } });
  await signIn(page, account);

  await page.goto('/notifications');
  await expect(page.getByText('The team reached its goal')).toBeVisible();
  await expect(page.getByText('New leads this week: 1 of 1')).toBeVisible();

  // Looking again, or setting it again, does not say it twice.
  await account.api('/goals', { method: 'PUT', body: { metric: 'LEADS', period: 'WEEK', scope: 'TEAM', target: 1 } });
  await page.waitForTimeout(1500);
  const list = (await account.api<{ items?: { type: string }[] } | { type: string }[]>('/notifications')).data;
  const items = Array.isArray(list) ? list : list.items ?? [];
  expect(items.filter((n) => n.type === 'goal.team_reached')).toHaveLength(1);
});
