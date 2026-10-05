import { expect, newAccount, closeAccount, signIn, test } from './support';

/** A link names its workspace, and opens there for whoever may see it. */

test('a link opens in the workspace it names, and the address always says which', async ({ page, account }) => {
  // The company's workspace, and a personal one of the same person's.
  const personal = await account.api<{ id: string; slug: string }>('/orgs/personal', { body: {} });
  expect(personal.status, JSON.stringify(personal.data)).toBe(201);
  const company = (await account.api<{ org: { id: string; slug: string; name: string } }[]>('/orgs')).data.find((m) => m.org.id === account.orgId)!.org;

  await signIn(page, account);
  // The address names the open workspace.
  await expect(page).toHaveURL(new RegExp(`[?&]w=${company.slug}`));

  // A link to the personal one switches to it, whatever was open before.
  await page.goto(`/leads?w=${personal.data.slug}`);
  await expect(page.getByText('Your personal workspace').first()).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/leads\\?w=${personal.data.slug}`));
  expect(await page.evaluate(() => localStorage.getItem('vertex_org_id'))).toBe(personal.data.id);

  // Links written by the server carry the id; they land in the same place.
  await page.goto(`/dashboard?w=${company.id}`);
  await expect(page.getByText(company.name).first()).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('vertex_org_id'))).toBe(company.id);
});

test('a link to a workspace someone is not in says so, and sends nothing there', async ({ page, account }) => {
  const other = await newAccount('E2E Other');
  try {
    const theirs = (await other.api<{ org: { id: string; slug: string } }[]>('/orgs')).data[0]!.org;
    await signIn(page, account);
    const asked: string[] = [];
    page.on('request', (r) => {
      const h = r.headers()['x-organization-id'];
      if (h) asked.push(h);
    });
    await page.goto(`/leads?w=${theirs.slug}`);
    await expect(page.getByRole('heading', { name: 'You are not in this workspace' })).toBeVisible();
    expect(asked).not.toContain(theirs.id);
    // The way back is offered.
    await page.getByRole('button', { name: /^Go to / }).click();
    await page.waitForURL(/\/dashboard/);
    await expect(page.getByRole('heading', { name: 'You are not in this workspace' })).toHaveCount(0);
  } finally {
    await closeAccount(other);
  }
});
