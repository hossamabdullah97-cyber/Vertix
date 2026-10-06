import { expect, signIn, test } from './support';

test('what the guided start asks for is kept on the card, not only as its buttons', async ({ page, account }) => {
  const created = await account.api<{ id: string }>('/cards', { body: { templateId: 'swiss-indigo' } });
  expect(created.status, JSON.stringify(created.data)).toBe(201);

  await signIn(page, account);
  await page.goto(`/cards/${created.data.id}`);
  await page.getByLabel('Full name').fill('Hossam Abdullah');
  await page.getByLabel('Job title').fill('Founder');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('WhatsApp').fill('+201129052244');
  await page.getByLabel('Phone').fill('+201029665534');
  await page.getByLabel('Email').fill('hossam@example.test');
  await page.getByLabel('Website').fill('https://vertex.example');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Create my card' }).click();

  // The card's own details: what the studio's fields and the saved contact read.
  await expect
    .poll(async () => (await account.api<{ vcardData: Record<string, string> }>(`/cards/${created.data.id}`)).data.vcardData)
    .toMatchObject({ fullName: 'Hossam Abdullah', title: 'Founder', phone: '+201029665534', email: 'hossam@example.test', website: 'https://vertex.example' });
  // And its buttons, as before (added one after another once the details are saved).
  await expect
    .poll(async () => (await account.api<{ actions: { type: string }[] }>(`/cards/${created.data.id}`)).data.actions.map((a) => a.type))
    .toEqual(['WHATSAPP', 'CALL', 'EMAIL', 'WEBSITE']);

  // The studio shows them filled in, not empty.
  await page.reload();
  await expect(page.locator('input[value="+201029665534"]').first()).toBeVisible();
  await expect(page.locator('input[value="hossam@example.test"]').first()).toBeVisible();
});
