import type { BrowserContext, Page } from '@playwright/test';
import { expect, publishedCard, signIn, test } from './support';

/** No signal: the browser says so, and every request (the service worker's too) fails. */
async function goOffline(context: BrowserContext) {
  await context.route('**/*', (route) => route.abort('internetdisconnected'));
  await context.setOffline(true);
}
async function goOnline(context: BrowserContext) {
  await context.unrouteAll({ behavior: 'ignoreErrors' });
  await context.setOffline(false);
}
/**
 * Waits until the service worker runs the page and has kept these addresses
 * and every script, style and font the page loaded from this site.
 */
async function kept(page: Page, ...paths: string[]) {
  await page.waitForFunction(
    async (list) => {
      if (!navigator.serviceWorker.controller) return false;
      const loaded = performance
        .getEntriesByType('resource')
        .map((r) => r.name)
        .filter((u) => u.startsWith(location.origin) && /\/_next\/static\/|\/fonts\//.test(u));
      for (const u of [...list.map((p) => new URL(p, location.href).href), ...loaded]) if (!(await caches.match(u, { ignoreSearch: true }))) return false;
      return true;
    },
    paths,
    { timeout: 20_000, polling: 300 },
  );
}

test.describe('without a signal', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('a card opened once opens again offline, saves its contact, and keeps the visitor’s details until the signal returns', async ({ browser, account }) => {
    const card = await publishedCard(account, 'Omar Offline');

    const visitor = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, acceptDownloads: true });
    const page = await visitor.newPage();
    await page.goto(`/c/${card.slug}`);
    await expect(page.getByText('Omar Offline').first()).toBeVisible();
    await kept(page, `/c/${card.slug}`, `/c/${card.slug}/contact.vcf`);

    await goOffline(visitor);
    await page.reload();
    await expect(page.getByText('Omar Offline').first()).toBeVisible();
    await expect(page.getByText(/You're offline: this is the card as you last opened it/)).toBeVisible();

    // The contact still saves.
    const download = page.waitForEvent('download');
    await page.getByRole('link', { name: 'Save contact' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/\.vcf$/);
    expect(await (await file.createReadStream()).toArray().then((c) => Buffer.concat(c).toString())).toContain('FN:Omar Offline');

    // Their details wait on the phone…
    await page.getByRole('button', { name: 'Exchange' }).click();
    await page.locator('input[autocomplete=name]').fill('Laila Nosignal');
    await page.locator('input[type=tel]').fill('01007776655');
    await page.getByRole('button', { name: 'Send my details' }).click();
    await expect(page.getByText(/Your details are saved on this phone/)).toBeVisible();
    expect((await account.api<{ name: string }[]>('/leads')).data.some((l) => l.name === 'Laila Nosignal')).toBe(false);

    // …and reach the owner once the signal is back.
    await goOnline(visitor);
    await expect.poll(async () => (await account.api<{ name: string }[]>('/leads')).data.some((l) => l.name === 'Laila Nosignal'), { timeout: 20_000 }).toBe(true);
    await visitor.close();
  });

  test('"Met someone" still shows the QR code offline, and a number taken then is added once back online', async ({ page, context, account }) => {
    await publishedCard(account, 'Rana Stand');
    await signIn(page, account);
    await page.goto('/meet');
    await expect(page.locator('img[alt="QR code"]')).toBeVisible();
    await kept(page, '/meet');
    // And its translations, which the signed-in app loads separately.
    await page.waitForFunction(async () => (await (await caches.open('vertex-cards-v1')).keys()).some((r) => r.url.includes('/i18n/')), null, { timeout: 20_000 });

    await goOffline(context);
    await page.reload();
    await expect(page.locator('img[alt="QR code"]')).toBeVisible();
    await expect(page.getByText('Rana Stand')).toBeVisible();

    await page.getByRole('button', { name: 'Their number' }).click();
    const sheet = page.getByRole('dialog');
    await sheet.locator('label:has-text("Name") input').fill('Tarek Basement');
    await sheet.locator('input[type=tel]').fill('01112224466');
    await sheet.getByRole('button', { name: 'Save lead' }).click();
    await expect(page.getByText('Tarek Basement is in your leads')).toBeVisible();
    await expect(page.getByText(/No signal: saved on this phone/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open the lead' })).toHaveCount(0);

    await goOnline(context);
    await expect.poll(async () => (await account.api<{ name: string }[]>('/leads')).data.some((l) => l.name === 'Tarek Basement'), { timeout: 20_000 }).toBe(true);
  });
});
