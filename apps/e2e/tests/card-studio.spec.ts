import { join } from 'node:path';
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

  // Anything pasted into the one box is recognised: a LinkedIn address opens LinkedIn, username filled in.
  await page.getByTestId('link-paste').fill('https://www.linkedin.com/in/studio-person');
  await page.getByTestId('link-paste').press('Enter');
  await expect(dialog.getByLabel('Username')).toHaveValue('studio-person');
  await dialog.getByRole('button', { name: 'Add to card' }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(async () => (await card()).actions.find((a) => a.type === 'LINKEDIN')?.config.url).toBe('https://linkedin.com/in/studio-person');
  // A number asks which it is.
  await page.getByTestId('link-paste').fill('+20 122 333 4444');
  await page.getByTestId('link-paste').press('Enter');
  await page.getByRole('status').filter({ hasText: 'Add this number as' }).getByRole('button', { name: 'Phone' }).click();
  await expect(dialog.getByLabel('Phone number')).toHaveValue('+20 122 333 4444');
  await dialog.getByRole('button', { name: 'Add to card' }).click();
  await expect.poll(async () => (await card()).actions.find((a) => a.type === 'CALL')?.config.phone).toBe('+20 122 333 4444');

  // A ready-made design is one tap, and a font another.
  await page.getByRole('tab', { name: 'Design' }).click();
  await page.getByTestId('template-noir-teal').click();
  await expect.poll(async () => (await account.api<{ templateId: string }>(`/cards/${id}`)).data.templateId).toBe('noir-teal');
  await page.getByTestId('font-cairo').click();
  await expect.poll(async () => (await account.api<{ theme: { font?: string } }>(`/cards/${id}`)).data.theme.font).toBe('cairo');
});

test('a card is deleted from its menu in the list, or from the studio, and a photo outlives the disk', async ({ page, account }) => {
  const make = async (fullName: string) => {
    const created = await account.api<{ id: string }>('/cards', { body: { templateId: 'swiss-blue' } });
    await account.api(`/cards/${created.data.id}`, { method: 'PATCH', body: { vcardData: { fullName } } });
    return created.data.id;
  };
  const first = await make('First To Go');
  const second = await make('Second To Go');
  const gone = async (id: string) => (await account.api(`/cards/${id}`)).status;

  await signIn(page, account);

  // A photo is uploaded and served from where it is kept (the database here, as in production).
  await page.goto(`/cards/${second}`);
  await page.locator('input[type=file]').first().setInputFiles(join(__dirname, '../fixtures/paper-card-qr.png'));
  await page.getByTestId('crop-done').click();
  await expect.poll(async () => (await account.api<{ vcardData: { avatar?: string } }>(`/cards/${second}`)).data.vcardData.avatar ?? '').toMatch(/\/uploads\/[\w-]+\.png$/);
  const avatar = (await account.api<{ vcardData: { avatar: string } }>(`/cards/${second}`)).data.vcardData.avatar;
  const served = await page.request.get(avatar);
  expect(served.status()).toBe(200);
  expect(served.headers()['content-type']).toBe('image/png');

  // In the list: the card's own menu, then Delete (with Undo).
  await page.goto('/cards');
  const tile = page.locator('article').filter({ hasText: 'First To Go' });
  await tile.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await expect(tile).toHaveCount(0);
  await expect.poll(() => gone(first)).toBe(404);

  // In the studio: its menu, then a confirmation.
  await page.goto(`/cards/${second}`);
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Delete card' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete permanently' }).click();
  await page.waitForURL(/\/cards(\?|$)/);
  await expect.poll(() => gone(second)).toBe(404);
});
