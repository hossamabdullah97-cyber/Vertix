import { expect, signIn, test } from './support';

test('the menu is whole from the start, so a link does not move under a click', async ({ page, account }) => {
  await signIn(page, account);
  // The account arrives late, as on a slow connection.
  let arrived = false;
  await page.route(/\/api\/auth\/me$/, async (route) => {
    await new Promise((r) => setTimeout(r, 2000));
    await route.continue();
    arrived = true;
  });
  // The shell asks for the account once the page is live.
  const asked = page.waitForRequest(/\/api\/auth\/me$/);
  await page.goto('/leads');
  await asked;
  // Measured once the fonts are in, which resize the text on their own.
  await page.evaluate(() => document.fonts.ready.then(() => undefined));

  const nav = page.getByRole('navigation').first();
  const help = nav.getByRole('link', { name: 'Help', exact: true });
  // The owner's own pages are there already, before the account is.
  expect(await nav.getByRole('link', { name: 'Team', exact: true }).count()).toBe(1);
  const before = await help.boundingBox();
  expect(arrived).toBe(false);

  await expect.poll(() => arrived, { timeout: 10_000 }).toBe(true);
  await page.waitForTimeout(300);
  expect(await help.boundingBox()).toEqual(before);

  await help.click();
  await expect(page).toHaveURL(/\/help(\?|$)/);
});

test('a menu page is fetched ahead, and a click on one still on its way shows it was taken', async ({ page, account }) => {
  await signIn(page, account);
  const nav = page.getByRole('navigation').first();

  // Once the menu's pages are in, opening one does not wait on the server.
  await page.goto('/dashboard');
  await page.waitForLoadState('networkidle');
  await page.route(/_rsc=/, async (route) => {
    await new Promise((r) => setTimeout(r, 1500));
    await route.continue();
  });
  const started = Date.now();
  await nav.getByRole('link', { name: 'Leads', exact: true }).click();
  await page.waitForURL(/\/leads/);
  expect(Date.now() - started).toBeLessThan(1000);

  // A page still on its way: the link says so at once, and one click is enough.
  await page.goto('/cards');
  const link = nav.getByRole('link', { name: 'Help', exact: true });
  await link.click();
  await expect(link.locator('.v-nav-pending')).toBeVisible();
  await page.waitForURL(/\/help/);
  await expect(link.locator('.v-nav-pending')).toHaveCount(0);
});

test("moving between pages does not ask again for the shell's account, workspaces and plan", async ({ page, account }) => {
  await signIn(page, account);
  await page.goto('/dashboard');
  await page.waitForLoadState('networkidle');

  const SHELL = ['/api/auth/me', '/api/orgs', '/api/billing/subscription', '/api/invitations', '/api/notifications/unread-count'];
  const asked: string[] = [];
  page.on('request', (r) => {
    const path = new URL(r.url()).pathname;
    if (SHELL.includes(path)) asked.push(path);
  });
  const nav = page.getByRole('navigation').first();
  for (const [name, path] of [['Leads', '/leads'], ['Cards', '/cards'], ['Analytics', '/analytics']] as const) {
    await nav.getByRole('link', { name, exact: true }).click();
    await page.waitForURL((u) => u.pathname === path);
    await page.waitForLoadState('networkidle');
  }
  // The page's own reads still go out (a page may well ask for the account itself);
  // the shell's do not, three pages in a row within the minute.
  const shellAsked = asked.filter((p) => p !== '/api/auth/me');
  expect(shellAsked).toEqual([]);
});
