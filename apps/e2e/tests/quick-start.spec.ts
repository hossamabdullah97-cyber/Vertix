import { join } from 'node:path';
import { expect, signIn, test } from './support';

test('what the guided start asks for is kept on the card, not only as its buttons', async ({ page, account }) => {
  const created = await account.api<{ id: string }>('/cards', { body: { templateId: 'swiss-indigo' } });
  expect(created.status, JSON.stringify(created.data)).toBe(201);

  await signIn(page, account);
  await page.goto(`/cards/${created.data.id}`);
  await page.getByRole('button', { name: /I’ll write it myself/ }).click();
  await page.getByLabel('Full name').fill('Hossam Abdullah');
  await page.getByLabel('Job title').fill('Founder');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('WhatsApp').fill('+201129052244');
  await page.getByLabel('Phone').fill('+201029665534');
  await page.getByLabel('Email').fill('hossam@example.test');
  await page.getByLabel('Website').fill('https://vertex.example');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Create my card' }).click();
  await expect(page.getByRole('heading', { name: /Your card is ready/ })).toBeVisible();

  // The card's own details: what the studio's fields and the saved contact read.
  await expect
    .poll(async () => (await account.api<{ vcardData: Record<string, string> }>(`/cards/${created.data.id}`)).data.vcardData)
    .toMatchObject({ fullName: 'Hossam Abdullah', title: 'Founder', phone: '+201029665534', email: 'hossam@example.test', website: 'https://vertex.example' });
  // And its buttons, as before (added one after another once the details are saved).
  await expect
    .poll(async () => (await account.api<{ actions: { type: string }[] }>(`/cards/${created.data.id}`)).data.actions.map((a) => a.type))
    .toEqual(['WHATSAPP', 'CALL', 'EMAIL', 'WEBSITE']);

  // The studio shows them filled in, not empty (the saved contact is under Contact and links).
  await page.reload();
  await page.getByRole('tab', { name: 'Links' }).click();
  await expect(page.locator('input[value="+201029665534"]').first()).toBeVisible();
  await expect(page.locator('input[value="hossam@example.test"]').first()).toBeVisible();
});

test('a photo of the paper card fills the card in, and it can go live from there', async ({ page, account }) => {
  const created = await account.api<{ id: string }>('/cards', { body: { templateId: 'swiss-indigo' } });
  expect(created.status).toBe(201);
  const id = created.data.id;

  await signIn(page, account);
  await page.goto(`/cards/${id}`);
  // A card with a vCard QR code: read exactly, on this device.
  await page.getByTestId('quickstart-photo').setInputFiles(join(__dirname, '../fixtures/paper-card-qr.png'));
  await expect(page.getByRole('heading', { name: 'We read your card' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByLabel('Full name')).toHaveValue('Salma Fathy');
  await expect(page.getByLabel('Job title')).toHaveValue('Marketing Manager');
  await expect(page.getByLabel('Company')).toHaveValue('Nile Foods');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByLabel('WhatsApp')).toHaveValue('+201112223344');
  await expect(page.getByLabel('Email')).toHaveValue('salma@nilefoods.example');
  await expect(page.getByLabel('Website')).toHaveValue('https://nilefoods.example');
  await page.getByRole('button', { name: 'Continue' }).click();
  // The paper card's own colour is offered, and chosen.
  await expect(page.getByRole('button', { name: 'From your card' }).first()).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Create my card' }).click();
  await expect(page.getByRole('heading', { name: /Your card is ready/ })).toBeVisible();

  const card = (await account.api<{ isPublished: boolean; vcardData: Record<string, string>; theme: { accent: string }; actions: { type: string }[] }>(`/cards/${id}`)).data;
  expect(card.vcardData).toMatchObject({ fullName: 'Salma Fathy', title: 'Marketing Manager', company: 'Nile Foods', phone: '+201112223344', email: 'salma@nilefoods.example' });
  expect(card.actions.map((a) => a.type)).toEqual(['WHATSAPP', 'CALL', 'EMAIL', 'WEBSITE']);
  expect(card.theme.accent).not.toBe('#534ab7');
  expect(card.isPublished).toBe(false);

  await page.getByTestId('quickstart-publish').click();
  await expect(page.getByRole('heading', { name: /Your card is live/ })).toBeVisible();
  await expect.poll(async () => (await account.api<{ isPublished: boolean }>(`/cards/${id}`)).data.isPublished).toBe(true);
  await page.getByTestId('quickstart-edit').click();
  await expect(page.getByRole('tab', { name: 'Profile' })).toBeVisible();
});
