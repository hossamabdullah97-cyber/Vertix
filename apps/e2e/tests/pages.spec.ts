import { expect, publishedCard, signIn, test, useArabic } from './support';

/** Every main page of the app, opened by a signed-in owner. */
const PAGES = ['/dashboard', '/leads', '/cards', '/analytics', '/team', '/workspace', '/account', '/notifications', '/meet', '/tags', '/integrations', '/billing'];

/** A line that is only a translation key ("goals.metric.LEADS") means a missing string. */
const RAW_KEY = /^[a-z][a-zA-Z]*(\.[a-zA-Z_]+){1,4}$/;

for (const lang of ['en', 'ar'] as const) {
  test(`every main page opens cleanly in ${lang === 'en' ? 'English' : 'Arabic, on a phone'}`, async ({ page, account }) => {
    test.setTimeout(150_000);
    if (lang === 'ar') {
      await page.setViewportSize({ width: 390, height: 844 });
      await useArabic(page);
    }
    await publishedCard(account, 'Page Sweep');
    await account.api('/leads', { body: { name: 'Sweep Lead', phone: '01001234000', source: 'manual' } });
    await signIn(page, account);

    for (const path of PAGES) {
      await test.step(path, async () => {
        await page.goto(path);
        await page.waitForLoadState('networkidle');
        await expect(page.locator('html')).toHaveAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
        const lines = (await page.locator('body').innerText()).split('\n').map((l) => l.trim());
        expect(lines.filter((l) => RAW_KEY.test(l)), `untranslated keys on ${path}`).toEqual([]);
        // Nothing wider than the screen on a phone.
        if (lang === 'ar') expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `sideways scroll on ${path}`).toBeLessThanOrEqual(1);
      });
    }
  });
}
