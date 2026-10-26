import { expect, signIn, test } from './support';

type Action = { type: string; isActive: boolean; config: Record<string, unknown> };
type CardData = { vcardData: Record<string, string>; actions: Action[]; sections: { type: string; content: Record<string, unknown> }[] };

test('a button is added in one step, with its value asked for first', async ({ page, account }) => {
  const created = await account.api<{ id: string }>('/cards', { body: { templateId: 'swiss-blue' } });
  expect(created.status).toBe(201);
  const id = created.data.id;
  // A card with a name opens in the Studio itself, not the guided start.
  await account.api(`/cards/${id}`, { method: 'PATCH', body: { vcardData: { fullName: 'Studio Person' } } });
  const card = async () => (await account.api<CardData>(`/cards/${id}`)).data;

  await signIn(page, account);
  await page.goto(`/cards/${id}`);

  // About is written in Profile and saved as the card's About section.
  await page.getByLabel('About').fill('I make brand identities.');
  await page.getByLabel('Job title').click();
  await expect.poll(async () => (await card()).sections.find((s) => s.type === 'BIO')?.content.body).toBe('I make brand identities.');

  // The part open is kept in the address.
  await page.getByRole('tab', { name: 'Links' }).click();
  await expect(page).toHaveURL(/[?&]tab=links/);

  // Nothing is added until the value is there and makes sense.
  await page.getByTestId('quick-add-WHATSAPP').click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Add to card' }).click();
  await expect(dialog).toContainText('Fill this in to add the button.');
  await dialog.getByLabel('Phone number').fill('123');
  await dialog.getByRole('button', { name: 'Add to card' }).click();
  await expect(dialog).toContainText('doesn’t look like a phone number');
  expect((await card()).actions).toHaveLength(0);

  await dialog.getByLabel('Phone number').fill('+20 100 555 0142');
  await dialog.getByRole('button', { name: 'Add to card' }).click();
  await expect(dialog).toBeHidden();
  // The number is also the saved contact's, which had none.
  await expect.poll(async () => (await card()).vcardData.phone).toBe('+20 100 555 0142');
  expect((await card()).actions).toEqual([expect.objectContaining({ type: 'WHATSAPP', config: { phone: '+20 100 555 0142', isQuick: true } })]);

  // A username is put after the site's address, dots and all.
  await page.getByTestId('quick-add-INSTAGRAM').click();
  await dialog.getByLabel('Username').fill('@studio.person');
  await dialog.getByRole('button', { name: 'Add to card' }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(async () => (await card()).actions.map((a) => a.config.url).filter(Boolean)).toEqual(['https://instagram.com/studio.person']);

  // Changed from its row: moved to the round buttons, the username kept.
  await page.getByRole('button', { name: 'Change Instagram' }).first().click();
  await expect(dialog.getByLabel('Username')).toHaveValue('studio.person');
  await dialog.getByRole('radio', { name: /Round button/ }).click();
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();
  await expect
    .poll(async () => (await card()).actions.find((a) => a.type === 'WEBSITE')?.config)
    .toEqual({ url: 'https://instagram.com/studio.person', isQuick: true });

  // A ready-made design is one tap.
  await page.getByRole('tab', { name: 'Design' }).click();
  await page.getByTestId('template-noir-teal').click();
  await expect.poll(async () => (await account.api<{ templateId: string }>(`/cards/${id}`)).data.templateId).toBe('noir-teal');
});
