import { expect, publishedCard, signIn, test } from './support';

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test('"Met someone": show the card\'s QR, take their number, send them the card on WhatsApp', async ({ page, account }) => {
  const card = await publishedCard(account, 'Salma Seller');
  await signIn(page, account);

  await page.goto('/meet');
  await expect(page.locator('img[alt="QR code"]')).toBeVisible();
  await expect(page.getByText('Salma Seller')).toBeVisible();

  await page.getByRole('button', { name: 'Their number' }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('heading', { name: 'Their details' })).toBeVisible();
  await sheet.locator('label:has-text("Name") input').fill('Karim Contact');
  await sheet.locator('input[type=tel]').fill('0100 222 3344');
  await sheet.getByRole('button', { name: 'Save lead' }).click();

  await expect(page.getByText('Karim Contact is in your leads')).toBeVisible();
  const wa = await page.getByRole('link', { name: 'Send my card on WhatsApp' }).getAttribute('href');
  expect(wa).toMatch(/^https:\/\/wa\.me\/201002223344\?text=/);
  expect(decodeURIComponent(wa!)).toContain(`/c/${card.slug}`);

  const leads = await account.api<{ name: string; source: string }[]>('/leads');
  expect(leads.data.find((l) => l.name === 'Karim Contact')?.source).toBe('in_person');
});
