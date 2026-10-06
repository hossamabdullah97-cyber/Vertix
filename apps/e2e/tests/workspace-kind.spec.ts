import { randomBytes } from 'node:crypto';
import { call, closeAccount, expect, PASSWORD, signIn, test, type Account } from './support';

/** Someone on their own, and what changes when they start working with a team. */

test('a person signing up for themselves gets a workspace without team machinery, and can make it a team’s later', async ({ page }) => {
  const email = `e2e-personal-${randomBytes(4).toString('hex')}@example.test`;
  await page.goto('/login?mode=register');
  // Nothing is assumed: the form asks who it is for.
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('Choose one to go on.')).toBeVisible();

  await page.getByText('Just me', { exact: true }).click();
  await expect(page.getByLabel('Company or team name')).toHaveCount(0);
  await page.getByLabel('Your name').fill('Salma Solo');
  await page.locator('input[autocomplete=email]').fill(email);
  await page.locator('input[type=password]').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL(/\/dashboard/);

  // Their workspace carries their name, and the menu has no team in it.
  await expect(page.getByText('Your personal workspace').first()).toBeVisible();
  const nav = page.getByRole('navigation').first();
  await expect(nav.getByRole('link', { name: 'Team', exact: true })).toHaveCount(0);

  const login = await call<{ accessToken: string }>('/auth/login', { body: { email, password: PASSWORD } });
  const claims = JSON.parse(Buffer.from(login.data.accessToken.split('.')[1]!, 'base64url').toString());
  const a = { email, password: PASSWORD, token: login.data.accessToken, orgId: claims.orgId } as Account;
  a.api = (path, opts = {}) => call(path, { ...opts, token: a.token, orgId: a.orgId });
  expect((await a.api('/auth/me')).data).toMatchObject({ workspaceKind: 'PERSONAL' });
  // Nobody can be invited into it.
  const invite = await a.api('/orgs/members/invite', { body: { email: `x-${email}`, role: 'EMPLOYEE' } });
  expect(invite.status).toBe(400);
  expect(invite.data.message).toMatch(/personal workspace/);

  // Past the welcome a new account sees once.
  await a.api('/account/onboarding', { method: 'PATCH', body: { welcomed: true } });

  // The team page says how to get a team, and Settings does it.
  await page.goto('/team');
  await expect(page.getByText('This is your personal workspace')).toBeVisible();
  await page.getByRole('link', { name: 'Make it a team workspace' }).click();
  await page.waitForURL(/\/workspace/);
  await page.getByRole('button', { name: 'Make it a team workspace' }).click();
  await page.getByLabel('Company or team name').fill('Salma Studio');
  await page.locator('form').getByRole('button', { name: 'Make it a team workspace' }).click();
  await page.waitForURL(/\/team/);

  const me = await a.api('/auth/me');
  expect(me.data).toMatchObject({ workspaceKind: 'TEAM' });
  const orgs = await a.api<{ org: { id: string; name: string; kind: string } }[]>('/orgs');
  expect(orgs.data.map((m) => m.org)).toEqual([expect.objectContaining({ id: a.orgId, name: 'Salma Studio', kind: 'TEAM' })]);
  await closeAccount(a);
});

test('a company’s own workspace stays a team’s, with nothing to convert', async ({ account }) => {
  expect((await account.api('/auth/me')).data).toMatchObject({ workspaceKind: 'TEAM' });
  expect((await account.api('/orgs/current/convert', { body: { name: 'Again' } })).status).toBe(400);
});

test('each kind of workspace is offered its own plans', async ({ page, account }) => {
  // A company's: the team plans, not the personal one.
  await signIn(page, account);
  await page.goto('/billing');
  await expect(page.getByRole('heading', { name: 'Pro', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Personal', exact: true })).toHaveCount(0);

  // A person's own: Free and Personal, with no seats counted.
  const personal = (await account.api<{ id: string; slug: string }>('/orgs/personal', { body: {} })).data;
  await page.goto(`/billing?w=${personal.slug}`);
  await expect(page.getByRole('heading', { name: 'Personal', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Pro', exact: true })).toHaveCount(0);
  await expect(page.getByText(/members/i)).toHaveCount(0);
});

test('the pricing page’s personal button opens sign-up for oneself', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Start on your own' }).click();
  await expect(page).toHaveURL(/kind=personal/);
  await expect(page.getByRole('radio', { name: /Just me/ })).toBeChecked();
  await expect(page.getByLabel('Company or team name')).toHaveCount(0);
});
