import { execFileSync } from 'node:child_process';
import { PASSWORD, call, closeAccount, expect, newAccount, signIn, test } from './support';

test('the help center finds an answer, takes a rating, and puts a person in reach', async ({ page, account }) => {
  await signIn(page, account);
  await page.goto('/leads');

  // From the sidebar, on any page.
  await page.getByRole('link', { name: 'Help', exact: true }).click();
  await expect(page).toHaveURL(/\/help(\?|$)/);
  await expect(page.getByRole('heading', { name: 'How can we help?' })).toBeVisible();
  await expect(page.getByTestId('help-category')).toHaveCount(8);

  // Search, and the address keeps it.
  await page.getByLabel('Search help').fill('import excel');
  await expect(page).toHaveURL(/q=import/);
  const first = page.getByTestId('help-article').first();
  await expect(first).toContainText('Import leads from Excel or CSV');
  await first.click();
  await expect(page.getByRole('heading', { name: 'Import leads from Excel or CSV' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Open leads/ })).toHaveAttribute('href', '/leads');

  // "Didn't help" leads straight to a person, with the article as the subject.
  await page.getByTestId('help-feedback').getByRole('button', { name: 'No' }).click();
  await expect(page.getByTestId('help-feedback')).toContainText('Tell us what was missing');
  await page.getByTestId('help-feedback').getByRole('button', { name: 'Contact support' }).click();
  const form = page.getByRole('dialog', { name: 'Contact support' });
  await expect(form.getByLabel('Subject')).toHaveValue('Import leads from Excel or CSV');
  await expect(form.getByLabel('About')).toHaveValue('leads');
  await form.getByLabel('Message').fill('My file from the old CRM stops at row 40 every time.');
  await form.getByRole('button', { name: 'Send' }).click();
  const sent = page.getByRole('dialog', { name: 'We got your message' });
  await expect(sent).toContainText(/reference is VX-[A-Z0-9]{6}/);
  await expect(sent).toContainText(account.email);
  const ref = (await sent.textContent())!.match(/VX-[A-Z0-9]{6}/)![0];

  // Kept, with the page they came from, and listed on the help home.
  const mine = (await account.api<any[]>('/support/requests')).data;
  expect(mine).toHaveLength(1);
  expect(mine[0]).toMatchObject({ ref, topic: 'leads', status: 'OPEN' });
  await page.goto('/help');
  await expect(page.getByTestId('support-requests')).toContainText(ref);

  // A topic opens its articles; a search with no answer offers a person.
  await page.getByTestId('help-category').filter({ hasText: 'Sharing and NFC chips' }).click();
  await expect(page.getByRole('heading', { name: 'Sharing and NFC chips' })).toBeVisible();
  await expect(page.getByTestId('help-article')).toHaveCount(4);
  await page.getByLabel('Search help').fill('zebra crossing');
  await expect(page.getByText('Nothing matches “zebra crossing”.')).toBeVisible();

  // The palette can ask the help center too.
  await page.goto('/dashboard');
  // The shortcut works once the page is live: press until the menu is open.
  const palette = page.getByRole('dialog');
  await expect(async () => {
    if (!(await palette.isVisible())) await page.keyboard.press('Control+k');
    await expect(palette).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 20_000 });
  await page.keyboard.type('chip');
  await page.getByRole('button', { name: /Search help for “chip”/ }).click();
  await expect(page).toHaveURL(/\/help\?.*q=chip/);
  await expect(page.getByTestId('help-article').first()).toContainText('NFC chips');

  // Messages and ratings are for the people who run the platform.
  expect((await account.api('/admin/support')).status).toBe(403);
  const admin = await newAccount('E2E Support Admin');
  try {
    const url = (process.env.DATABASE_URL ?? 'postgresql://vertex:vertex@localhost:5432/vertex_connect').split('?')[0]!;
    execFileSync('psql', [url, '-c', `UPDATE users SET "isSuperAdmin" = true WHERE id = '${admin.userId.replace(/[^a-z0-9]/gi, '')}'`]);
    const login = await call<{ accessToken: string }>('/auth/login', { body: { email: admin.email, password: PASSWORD } });
    const as = (path: string, opts: { method?: string } = {}) => call<any>(path, { ...opts, token: login.data.accessToken, orgId: admin.orgId });
    const open = (await as('/admin/support?status=OPEN')).data as any[];
    const row = open.find((r) => r.ref === ref);
    expect(row).toMatchObject({ email: account.email, topic: 'leads', page: '/leads' });
    expect((await as('/admin/support/feedback')).data).toEqual(expect.arrayContaining([expect.objectContaining({ article: 'import-leads' })]));
    expect((await as(`/admin/support/${row.id}/close`, { method: 'POST' })).status).toBe(201);
    expect((await account.api<any[]>('/support/requests')).data[0].status).toBe('CLOSED');
  } finally {
    await closeAccount(admin);
  }
});
