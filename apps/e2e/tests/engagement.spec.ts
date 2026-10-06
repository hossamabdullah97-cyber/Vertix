import { execFileSync } from 'node:child_process';
import { PASSWORD, call, closeAccount, expect, newAccount, signIn, test } from './support';

const DB = (process.env.DATABASE_URL ?? 'postgresql://vertex:vertex@localhost:5432/vertex_connect').split('?')[0]!;
const sql = (q: string) => execFileSync('psql', [DB, '-At', '-c', q]).toString().trim();
const safe = (id: string) => id.replace(/[^a-z0-9]/gi, '');

test('tips and reminders go to the right people, once, in their language, and can be turned off', async ({ page, account }) => {
  const admin = await newAccount('E2E Tips Admin');
  const away = await newAccount('E2E Away Owner');
  try {
    sql(`UPDATE users SET "isSuperAdmin" = true WHERE id = '${safe(admin.userId)}'`);
    const token = (await call<{ accessToken: string }>('/auth/login', { body: { email: admin.email, password: PASSWORD } })).data.accessToken;
    const asAdmin = <T = any>(path: string, opts: { method?: string; body?: unknown } = {}) => call<T>(path, { ...opts, token, orgId: admin.orgId });
    expect((await account.api('/admin/engagement')).status).toBe(403);

    // The app tells the API the language it's used in.
    expect((await account.api('/account/language', { method: 'PUT', body: { lang: 'ar' } })).status).toBe(200);
    expect(sql(`SELECT locale FROM users WHERE id = '${safe(account.userId)}'`)).toBe('ar');

    // A week away with a lead nobody has reached: "leads are waiting" comes first.
    expect((await away.api('/leads', { body: { name: 'Hana Fathy', phone: '+201001112223' } })).status).toBe(201);
    // Two days in with no card: "finish your card". Both made due at once, in
    // one transaction: the sweep is for everyone, and another test's sweep
    // running meanwhile must find them either not yet due or fully so.
    sql(
      `BEGIN;` +
        `UPDATE users SET "createdAt" = now() - interval '2 days', "emailVerified" = now() WHERE id IN ('${safe(account.userId)}', '${safe(away.userId)}');` +
        `UPDATE auth_sessions SET "lastSeenAt" = now() - interval '8 days' WHERE "userId" = '${safe(away.userId)}';` +
        `COMMIT;`,
    );

    const first = await asAdmin<{ sent: number }>('/admin/engagement/sweep', { method: 'POST' });
    expect(first.status).toBe(201);
    const kinds = (id: string) => sql(`SELECT string_agg(kind, ',' ORDER BY "sentAt") FROM engagement_emails WHERE "userId" = '${safe(id)}'`);
    expect(kinds(account.userId)).toBe('finishCard');
    expect(kinds(away.userId)).toBe('leadsWaiting');

    // Once, and nothing more for two days.
    await asAdmin('/admin/engagement/sweep', { method: 'POST' });
    expect(kinds(account.userId)).toBe('finishCard');
    expect(kinds(away.userId)).toBe('leadsWaiting');

    // Counted for the admin console.
    const stats = (await asAdmin<{ sent: Record<string, number> }>('/admin/engagement')).data;
    expect(stats.sent.finishCard).toBeGreaterThanOrEqual(1);
    expect(stats.sent.leadsWaiting).toBeGreaterThanOrEqual(1);

    // Turned off from the notification settings.
    await signIn(page, account);
    await page.goto('/notifications?settings=1');
    const tips = page.getByRole('switch', { name: 'Tips and reminders' });
    await expect(tips).toHaveAttribute('aria-checked', 'true');
    await tips.click();
    await expect(tips).toHaveAttribute('aria-checked', 'false');
    // The switch turns at once and the change is saved behind it: wait for the save.
    await expect.poll(() => sql(`SELECT tips FROM lead_alert_settings WHERE "userId" = '${safe(account.userId)}'`)).toBe('f');

    // A link not made for this person changes nothing.
    await page.goto(`/unsubscribe?u=${account.userId}&t=not-the-token`);
    await expect(page.getByTestId('unsubscribe-result')).toContainText('isn’t valid');
  } finally {
    await closeAccount(away);
    await closeAccount(admin);
  }
});
