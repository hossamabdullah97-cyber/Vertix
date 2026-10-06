import { expect, signIn, test } from './support';

test('a workspace adds its own lead fields and fills them in on a lead', async ({ page, account }) => {
  const lead = await account.api<{ id: string }>('/leads', { body: { name: 'Hana Fathy', company: 'Studio' } });
  await signIn(page, account);
  await page.goto(`/leads?lead=${lead.data.id}`);
  const drawer = page.getByRole('dialog', { name: 'Lead details' });

  // No fields yet: the owner adds two.
  await drawer.getByRole('button', { name: 'Add field' }).click();
  const sheet = page.getByRole('dialog', { name: 'Lead fields' });
  await sheet.getByLabel('Name').fill('Budget');
  await sheet.getByLabel('Kind').selectOption('NUMBER');
  await sheet.getByRole('button', { name: 'Add field' }).click();
  await expect(sheet.getByTestId('field-row')).toHaveCount(1);
  await sheet.getByLabel('Name').fill('Industry');
  await sheet.getByLabel('Kind').selectOption('SELECT');
  await sheet.getByLabel('Choices').fill('Retail\nReal estate');
  await sheet.getByRole('button', { name: 'Add field' }).click();
  await expect(sheet.getByTestId('field-row')).toHaveCount(2);
  await sheet.getByRole('button', { name: 'Close' }).click();

  // On the lead: a bad number is refused, a good one saved, and a choice picked.
  const budget = drawer.getByLabel('Budget');
  await budget.fill('a lot');
  await budget.press('Enter');
  await expect(drawer.getByText('Enter a number.')).toBeVisible();
  await budget.fill('25000');
  await budget.press('Enter');
  await drawer.getByLabel('Industry').selectOption('Real estate');

  await expect
    .poll(async () => {
      const fields = (await account.api<{ id: string; label: string }[]>('/leads/fields')).data;
      const detail = (await account.api<{ customFields: Record<string, unknown> }>(`/leads/${lead.data.id}`)).data;
      return Object.fromEntries(fields.map((f) => [f.label, detail.customFields?.[f.id]]));
    })
    .toEqual({ Budget: 25000, Industry: 'Real estate' });

  // A value that does not fit its field is refused by the API too.
  const industry = (await account.api<{ id: string; label: string }[]>('/leads/fields')).data.find((f) => f.label === 'Industry')!;
  expect((await account.api(`/leads/${lead.data.id}`, { method: 'PATCH', body: { customFields: { [industry.id]: 'Banking' } } })).status).toBe(400);
});
