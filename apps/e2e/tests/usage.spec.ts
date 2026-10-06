import { execFileSync } from 'node:child_process';
import { PASSWORD, call, closeAccount, expect, newAccount, signIn, test } from './support';

const DB = (process.env.DATABASE_URL ?? 'postgresql://vertex:vertex@localhost:5432/vertex_connect').split('?')[0]!;
const sql = (q: string) => execFileSync('psql', [DB, '-At', '-c', q]).toString().trim();

test('using the app is counted per day and feature, and the admin console shows it', async ({ page, account }) => {
  // Using the app: one row a day for any use, and one per part used.
  await account.api('/leads');
  await account.api('/leads');
  await account.api('/cards');
  const id = account.userId.replace(/[^a-z0-9]/gi, '');
  await expect.poll(() => sql(`SELECT string_agg(feature, ',' ORDER BY feature) FROM activity_days WHERE "userId" = '${id}'`)).toBe('_,cards,leads');

  expect((await account.api('/admin/usage')).status).toBe(403);
  const admin = await newAccount('E2E Usage Admin');
  try {
    sql(`UPDATE users SET "isSuperAdmin" = true WHERE id = '${admin.userId.replace(/[^a-z0-9]/gi, '')}'`);
    const token = (await call<{ accessToken: string }>('/auth/login', { body: { email: admin.email, password: PASSWORD } })).data.accessToken;
    const v = (await call<any>('/admin/usage?range=90', { token, orgId: admin.orgId })).data;
    expect(v.range).toBe(90);
    expect(v.daily).toHaveLength(90);
    expect(v.tiles.dau).toBeGreaterThanOrEqual(1);
    expect(v.funnel[0]).toMatchObject({ step: 'signedUp' });
    expect(v.funnel[0].users).toBeGreaterThanOrEqual(2);
    expect(v.adoption.find((a: { feature: string }) => a.feature === 'leads').users).toBeGreaterThanOrEqual(1);
    expect(v.retention).toHaveLength(8);
    expect(v.retention.at(-1).size).toBeGreaterThanOrEqual(2);

    await signIn(page, admin);
    await page.goto('/admin?tab=usage');
    await expect(page.getByTestId('usage-tiles')).toContainText('Active today');
    await expect(page.getByTestId('usage-funnel')).toContainText('Signed up');
    await expect(page.getByTestId('usage-adoption')).toContainText('Leads and tasks');
    await expect(page.getByTestId('usage-retention').locator('tbody tr')).toHaveCount(8);
    await page.getByRole('radio', { name: '90 days' }).click();
    await expect(page.getByTestId('usage-funnel')).toContainText('Signed up in the last 90 days');
  } finally {
    await closeAccount(admin);
  }
});
