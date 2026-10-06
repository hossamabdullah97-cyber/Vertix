import { expect, signIn, test } from './support';

test('an error no page caught is reported, with who met it, and the error list is for platform admins only', async ({ page, account }) => {
  await signIn(page, account);
  await page.goto('/leads');
  // As the window reports an uncaught error (dispatched, so the test's own error check stays quiet).
  // Sent again until the page's listener is in place: a busy machine can still be loading it.
  let res!: Awaited<ReturnType<typeof page.waitForResponse>>;
  await expect(async () => {
    const reported = page.waitForResponse((r) => r.url().endsWith('/telemetry/errors'), { timeout: 3000 });
    await page.evaluate(() => window.dispatchEvent(new ErrorEvent('error', { error: new TypeError('e2e: x is undefined'), message: 'e2e: x is undefined' })));
    res = await reported;
  }).toPass({ timeout: 30_000 });
  expect(res.status()).toBe(204);
  expect(res.request().headers()['authorization']).toMatch(/^Bearer /);
  expect(JSON.parse(res.request().postData() ?? '{}')).toMatchObject({ kind: 'error', name: 'TypeError', message: 'e2e: x is undefined', path: '/leads' });

  expect((await account.api('/admin/errors')).status).toBe(403);
});
