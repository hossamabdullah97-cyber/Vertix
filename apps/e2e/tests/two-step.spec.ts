import { expect, test, totp, waitForNextStep } from './support';

test.describe('two-step verification', () => {
  // Each code is good once, so these tests wait for fresh 30-second steps.
  test.setTimeout(150_000);

  test('turned on from the account page, then asked for at every sign-in', async ({ page, browser, account }) => {
    // A new browser for each sign-in, as if on another device.
    const signInElsewhere = async () => {
      const ctx = await browser.newContext();
      const p = await ctx.newPage();
      p.on('pageerror', (e) => {
        throw e;
      });
      await p.goto('/login');
      await p.locator('input[autocomplete=username]').fill(account.email);
      await p.locator('input[type=password]').fill(account.password);
      await p.getByRole('button', { name: 'Sign in', exact: true }).click();
      return p;
    };

    await page.goto('/login');
    await page.locator('input[autocomplete=username]').fill(account.email);
    await page.locator('input[type=password]').fill(account.password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.waitForURL(/\/dashboard/);
    await page.waitForFunction(() => !!localStorage.getItem('vertex_org_id'));
    await page.waitForLoadState('networkidle');

    // Setting it up: the QR code, its key, and the first code from the "app".
    await page.goto('/account');
    await page.getByRole('button', { name: 'Turn on' }).click();
    await expect(page.locator('img[alt="QR code"]')).toBeVisible();
    const secret = (await page.locator('button.font-mono span').innerText()).replace(/\s/g, '');
    account.totpSecret = secret;
    await page.locator('input[autocomplete=one-time-code]').fill(totp(secret));
    await page.getByRole('button', { name: 'Confirm' }).click();
    await expect(page.getByText('Save your recovery codes')).toBeVisible();
    const recovery = await page.locator('ul[dir=ltr] li').allInnerTexts();
    expect(recovery).toHaveLength(10);
    await page.getByRole('button', { name: "I've saved them" }).click();
    await expect(page.getByText(/recovery codes left/)).toBeVisible();

    // Signing in again: the password alone is not enough.
    const second = await signInElsewhere();
    await expect(second.getByRole('heading', { name: 'Two-step verification' })).toBeVisible();
    await second.locator('input[autocomplete=one-time-code]').fill('000000');
    await expect(second.getByText(/That code isn't right/)).toBeVisible();
    await expect(second).toHaveURL(/\/login/);

    // A recovery code works.
    await second.getByRole('button', { name: /Use a recovery code/ }).click();
    await second.locator('input[autocomplete=off]').fill(recovery[0]!);
    await second.getByRole('button', { name: 'Continue' }).click();
    await second.waitForURL(/\/dashboard/);

    // And a fresh code from the app.
    const third = await signInElsewhere();
    await expect(third.getByRole('heading', { name: 'Two-step verification' })).toBeVisible();
    await waitForNextStep();
    await third.locator('input[autocomplete=one-time-code]').fill(totp(secret));
    await third.waitForURL(/\/dashboard/);
  });
});
