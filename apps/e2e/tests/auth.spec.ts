import { randomBytes } from 'node:crypto';
import { call, closeAccount, expect, PASSWORD, signIn, test, useArabic, type Account } from './support';

test.describe('signing up and signing in', () => {
  test('a new person creates an account and lands in their workspace', async ({ page }) => {
    const email = `e2e-signup-${randomBytes(4).toString('hex')}@example.test`;
    await page.goto('/login?mode=register');
    await page.getByLabel('Your name').fill('Nour Signup');
    await page.getByLabel('Company or team').fill('Nour Studio');
    await page.locator('input[autocomplete=email]').fill(email);
    await page.locator('input[type=password]').fill(PASSWORD);
    await page.getByRole('button', { name: 'Create account' }).click();
    await page.waitForURL(/\/dashboard/);
    await expect(page.getByText('Nour Studio').first()).toBeVisible();

    const login = await call<{ accessToken: string }>('/auth/login', { body: { email, password: PASSWORD } });
    const claims = JSON.parse(Buffer.from(login.data.accessToken.split('.')[1]!, 'base64url').toString());
    const a = { email, password: PASSWORD, token: login.data.accessToken, orgId: claims.orgId } as Account;
    a.api = (path, opts = {}) => call(path, { ...opts, token: a.token, orgId: a.orgId });
    await closeAccount(a);
  });

  test('signs in, and refuses a wrong password in the reader’s language', async ({ page, account }) => {
    await page.goto('/login');
    await page.locator('input[autocomplete=username]').fill(account.email);
    await page.locator('input[type=password]').fill('not-the-password');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByText("That email and password don't match an account.")).toBeVisible();

    await useArabic(page);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await page.locator('input[autocomplete=username]').fill(account.email);
    await page.locator('input[type=password]').fill('still-wrong');
    await page.locator('button[type=submit]').click();
    await expect(page.getByText('البريد الإلكتروني وكلمة المرور لا يطابقان أي حساب.')).toBeVisible();

    await page.context().clearCookies();
    await signIn(page, account);
    await expect(page).toHaveURL(/\/dashboard/);
  });
});
