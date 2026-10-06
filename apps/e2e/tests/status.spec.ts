import { execFileSync } from 'node:child_process';
import { PASSWORD, call, closeAccount, expect, newAccount, signIn, test, useArabic } from './support';

test('the status page shows the checks, and an incident from post to resolved, in the app too', async ({ page, browser, account }) => {
  // Only the people who run the platform post.
  expect((await account.api('/admin/status/incidents')).status).toBe(403);

  const admin = await newAccount('E2E Status Admin');
  const url = (process.env.DATABASE_URL ?? 'postgresql://vertex:vertex@localhost:5432/vertex_connect').split('?')[0]!;
  execFileSync('psql', [url, '-c', `UPDATE users SET "isSuperAdmin" = true WHERE id = '${admin.userId.replace(/[^a-z0-9]/gi, '')}'`]);
  const token = (await call<{ accessToken: string }>('/auth/login', { body: { email: admin.email, password: PASSWORD } })).data.accessToken;
  const asAdmin = <T = any>(path: string, opts: { method?: string; body?: unknown } = {}) => call<T>(path, { ...opts, token, orgId: admin.orgId });
  const title = `E2E webhooks delayed ${Date.now()}`;
  let incidentId: string | undefined;

  try {
    // The checks, run now rather than waiting for the minute.
    const checks = (await asAdmin<{ id: string; status: string }[]>('/admin/status/checks', { method: 'POST' })).data;
    expect(checks.map((c) => c.id)).toEqual(['app', 'cards', 'email', 'webhooks']);
    expect(checks.find((c) => c.id === 'app')!.status).toBe('OPERATIONAL');

    // Public, no sign-in: each part with its 90 days.
    const visitor = await browser.newPage();
    await visitor.goto('/status');
    await expect(visitor.getByRole('heading', { name: 'System status', level: 1 })).toBeVisible();
    await expect(visitor.getByTestId('status-component')).toHaveCount(4);
    await expect(visitor.getByTestId('status-component').filter({ hasText: 'Webhooks and integrations' })).toContainText(/uptime|Working/);

    // Posted from the admin console.
    await signIn(page, admin);
    await page.goto('/admin?tab=status');
    await expect(page.getByTestId('status-checks')).toContainText('App and API');
    await page.getByRole('button', { name: 'Post an incident or maintenance' }).click();
    const form = page.getByRole('dialog', { name: 'Post an incident or maintenance' });
    await form.getByRole('checkbox', { name: 'Webhooks and integrations' }).check();
    await form.getByLabel('Title (English)').fill(title);
    await form.getByLabel('Title (Arabic, optional)').fill('تأخر في إرسال الـ Webhooks');
    await form.getByLabel('What is happening (English)').fill('Deliveries are going out late. Nothing is lost.');
    await form.getByRole('button', { name: 'Publish' }).click();
    await expect(page.getByTestId('incident-row').filter({ hasText: title })).toBeVisible();
    incidentId = (await asAdmin<{ id: string; title: string }[]>('/admin/status/incidents')).data.find((i) => i.title === title)!.id;

    // Everyone sees it: on the status page, and above every page of the app.
    await visitor.reload();
    await expect(visitor.getByTestId('overall')).toContainText('Some things are slower or failing');
    await expect(visitor.getByTestId('incident').filter({ hasText: title })).toContainText('Investigating');
    await useArabic(visitor);
    await visitor.reload();
    await expect(visitor.getByTestId('incident').filter({ hasText: 'تأخر في إرسال الـ Webhooks' })).toContainText('نتحقق من الأمر');
    await visitor.close();

    const user = await browser.newPage();
    await signIn(user, account);
    await expect(user.getByTestId('status-banner')).toContainText(title);
    await user.getByTestId('status-banner').getByRole('link', { name: 'Details' }).click();
    await expect(user).toHaveURL(/\/status$/);

    // Resolved: back to working, and listed under past incidents.
    const resolved = await asAdmin(`/admin/status/incidents/${incidentId}/updates`, { method: 'POST', body: { status: 'RESOLVED', message: 'All caught up.' } });
    expect(resolved.status).toBe(201);
    await user.goto('/status');
    await expect(user.getByText('Past incidents')).toBeVisible();
    await expect(user.getByTestId('incident').filter({ hasText: title })).toContainText('Resolved');
    await user.goto('/dashboard');
    await expect(user.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await expect(user.getByTestId('status-banner').filter({ hasText: title })).toHaveCount(0);
    await user.close();

    // Maintenance needs its window.
    const bad = await asAdmin('/admin/status/incidents', { method: 'POST', body: { title: 'Upgrade', impact: 'MAINTENANCE', components: ['app'], message: 'Planned upgrade' } });
    expect(bad.status).toBe(400);
  } finally {
    if (incidentId) await asAdmin(`/admin/status/incidents/${incidentId}`, { method: 'DELETE' });
    await closeAccount(admin);
  }
});
