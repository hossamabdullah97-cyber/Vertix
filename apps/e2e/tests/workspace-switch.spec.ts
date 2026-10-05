import { call, expect, publishedCard, signIn, test } from './support';

/** Moving between one's workspaces: at once, from the menu, the keyboard or search, and with what waits in each. */

test('switching workspace happens in place, and says what waits in the others', async ({ page, account }) => {
  // Names that do not contain each other, so each row is found by its own.
  expect((await account.api('/orgs/current', { method: 'PATCH', body: { name: 'Nile Trading' } })).status).toBe(200);
  const company = (await account.api<{ org: { id: string; slug: string; name: string } }[]>('/orgs')).data[0]!.org;
  const personal = (await account.api<{ id: string; slug: string; name: string }>('/orgs/personal', { body: {} })).data;
  // Something new in the company's workspace: a lead from its card.
  const card = await publishedCard(account, 'Switch Owner');
  expect((await call('/leads/capture', { body: { slug: card.slug, name: 'Laila Hassan', email: 'laila@example.com' } })).status).toBe(201);

  await signIn(page, account);
  await page.goto(`/leads?w=${company.slug}`);
  await expect(page).toHaveURL(new RegExp(`w=${company.slug}`));
  // A mark that a reload would wipe.
  await page.evaluate(() => ((window as unknown as { __stayed: number }).__stayed = 1));
  const stayed = () => page.evaluate(() => (window as unknown as { __stayed?: number }).__stayed);

  // From the menu: the same section, in the other workspace, without a reload.
  await page.locator('button[aria-expanded]').filter({ hasText: company.name }).first().click();
  await page.locator('[role=button]', { hasText: personal.name }).first().click();
  await expect(page).toHaveURL(new RegExp(`/leads\\?w=${personal.slug}`));
  await expect(page.getByText('Your personal workspace').first()).toBeVisible();
  expect(await stayed()).toBe(1);

  // The company's new lead is counted on it in the menu.
  await page.locator('button[aria-expanded]').filter({ hasText: personal.name }).first().click();
  await expect(page.locator('[role=button]', { hasText: company.name }).getByLabel('1 unread notification')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.mouse.click(5, 400);

  // W then its number goes back, still without a reload.
  const companyNumber = String((await account.api<{ org: { id: string } }[]>('/orgs')).data.findIndex((m) => m.org.id === company.id) + 1);
  await page.keyboard.press('w');
  await page.keyboard.press(companyNumber);
  await expect(page).toHaveURL(new RegExp(`/leads\\?w=${company.slug}`));
  await expect(page.getByText('Laila Hassan').first()).toBeVisible();
  expect(await stayed()).toBe(1);

  // And from search.
  await page.keyboard.press('Control+k');
  await page.keyboard.type(personal.name.slice(0, 6));
  await page.getByRole('button', { name: new RegExp(`Switch to ${personal.name}`) }).click();
  await expect(page).toHaveURL(new RegExp(`w=${personal.slug}`));
  expect(await stayed()).toBe(1);
});
