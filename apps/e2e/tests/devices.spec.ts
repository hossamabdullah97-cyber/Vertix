import { call, expect, signIn, test } from './support';

test.describe('signed-in devices', () => {
  test('listed on the account page, and the others signed out from there', async ({ page, browser, account }) => {
    // This browser, and a second one as if on another computer.
    await signIn(page, account);
    const elsewhere = await browser.newContext();
    const other = await elsewhere.newPage();
    await signIn(other, account);

    await page.goto('/account');
    const panel = page.locator('section', { has: page.getByRole('heading', { name: "Where you're signed in" }) });
    const rows = panel.getByTestId('device-row');
    // Both browsers, and the sign-up the test made through the API.
    await expect(rows).toHaveCount(3);
    await expect(rows.first()).toContainText('This device');
    await expect(rows.first()).toContainText('Chrome');
    await expect(panel.getByText('This device')).toHaveCount(1);

    await panel.getByRole('button', { name: 'Sign out all other devices' }).click();
    await expect(panel.getByText('Sign out the 2 other devices?')).toBeVisible();
    await panel.getByRole('button', { name: 'Sign them out' }).click();
    await expect(panel.getByText('2 devices were signed out.')).toBeVisible();
    await expect(rows).toHaveCount(1);

    // The other browser is out on its next request, renewal or not.
    await other.goto('/leads');
    await other.waitForURL(/\/login/);
    await elsewhere.close();

    // So is the API session the test signed up with: a fresh one closes the account.
    expect((await account.api('/auth/me')).status).toBe(401);
    const again = await call<{ accessToken: string }>('/auth/login', { body: { email: account.email, password: account.password } });
    account.token = again.data.accessToken;

    // This one is still in.
    await page.reload();
    await expect(rows).toHaveCount(2);
  });

  test('signing out ends the session on the server, not only in the browser', async ({ page, account }) => {
    await signIn(page, account);
    const refreshToken = await page.evaluate(() => localStorage.getItem('vertex_refresh'));
    expect((await call('/auth/refresh', { body: { refreshToken } })).status).toBe(201);

    await page.locator('button[aria-haspopup=menu]').first().click();
    await page.getByRole('menuitem', { name: 'Sign out' }).click();
    await page.waitForURL(/\/login/);
    await expect.poll(async () => (await call('/auth/refresh', { body: { refreshToken } })).status).toBe(401);
  });
});
