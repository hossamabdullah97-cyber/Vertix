import { expect, signIn, test } from './support';

test('the same person entered twice is found and merged into one lead', async ({ page, account }) => {
  // One phone number, written two ways, and the details split between the two.
  await account.api('/leads', { body: { name: 'Dina Twice', phone: '+20 100 555 1234', source: 'manual' } });
  await account.api('/leads', { body: { email: 'dina.twice@example.test', phone: '01005551234', company: 'Delta Foods', source: 'card_scan' } });

  await signIn(page, account);
  await page.goto('/leads');
  await expect(page.getByText('2 leads look like duplicates')).toBeVisible();
  await page.getByRole('button', { name: 'Review' }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByText('Same phone')).toBeVisible();
  await sheet.getByRole('button', { name: 'Merge 2 into one' }).click();
  await expect(page.getByText('2 leads merged into one')).toBeVisible();
  await expect(page.getByText('leads look like duplicates')).toHaveCount(0);

  const leads = (await account.api<{ name: string | null; email: string | null; company: string | null }[]>('/leads')).data;
  expect(leads).toHaveLength(1);
  expect(leads[0]).toMatchObject({ name: 'Dina Twice', email: 'dina.twice@example.test', company: 'Delta Foods' });
});
