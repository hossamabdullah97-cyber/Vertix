import { expect, signIn, test } from './support';

test('billing details are kept for the next invoice, and invoices are only for whoever may pay', async ({ page, account }) => {
  await signIn(page, account);
  await page.goto('/billing');
  await expect(page.getByRole('heading', { name: 'Invoices' })).toBeVisible();
  await expect(page.getByText('No invoices yet.')).toBeVisible();

  await page.getByLabel('Legal business name').fill('Nile Trading LLC');
  await page.getByLabel('Tax registration number').fill('123-456-789');
  await page.getByLabel('Billing address').fill('5 Nile Corniche, Giza');
  await page.getByLabel('Email for invoices').fill('Accounts@Nile.example');
  await page.getByRole('button', { name: 'Save details' }).click();
  await expect(page.getByText('Saved. The next invoice will use these details.')).toBeVisible();

  const details = await account.api('/billing/details');
  expect(details.data).toEqual({ legalName: 'Nile Trading LLC', taxId: '123-456-789', address: '5 Nile Corniche, Giza', email: 'accounts@nile.example' });
  await page.reload();
  await expect(page.getByLabel('Legal business name')).toHaveValue('Nile Trading LLC');

  // An invoice that is not this workspace's is not found, and a bad email is refused.
  expect((await account.api('/billing/invoices/not-an-invoice')).status).toBe(404);
  expect((await account.api('/billing/details', { method: 'PUT', body: { email: 'nope' } })).status).toBe(400);
});
