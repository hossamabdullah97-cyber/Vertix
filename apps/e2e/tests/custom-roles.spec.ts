import { closeAccount, confirmEmail, expect, newAccount, signIn, test } from './support';

test('an owner makes a role from parts of others, gives it, and it opens exactly those parts', async ({ page, account }) => {
  confirmEmail(account);
  const sara = await newAccount('Sara Nabil');
  try {
    expect((await account.api('/orgs/members/invite', { body: { email: sara.email, role: 'EMPLOYEE' } })).status).toBe(201);
    expect((await sara.api(`/invitations/${account.orgId}/accept`, { method: 'POST' })).status).toBeLessThan(300);
    sara.orgId = account.orgId;

    // As an employee: no billing, no teams.
    expect((await sara.api('/billing/invoices')).status).toBe(403);
    expect((await sara.api('/orgs/teams')).status).toBe(403);

    // The owner makes "Billing" from the team page: based on Employee, billing in full, teams to look at.
    await signIn(page, account);
    await page.goto('/team?view=roles');
    const section = page.getByTestId('custom-roles');
    await section.getByRole('button', { name: 'New role' }).click();
    const sheet = page.getByRole('dialog', { name: 'New role' });
    await sheet.getByLabel('Name').fill('Billing');
    await sheet.getByRole('radiogroup', { name: 'Based on' }).getByRole('radio', { name: 'Member' }).click();
    await sheet.getByRole('radiogroup', { name: 'Billing' }).getByRole('radio', { name: 'Full' }).click();
    await sheet.getByRole('radiogroup', { name: 'Teams and departments' }).getByRole('radio', { name: 'Basic' }).click();
    await expect(sheet).toContainText('Plan, payments, invoices and billing details.');
    await sheet.getByRole('button', { name: 'Save role' }).click();
    const role = section.getByTestId('custom-role').filter({ hasText: 'Billing' });
    await expect(role).toContainText('Based on Member');
    await expect(role).toContainText('Billing: Full');
    await expect(role).toContainText('Teams and departments: Basic');

    // Given to Sara from her details.
    const members = (await account.api<{ id: string; user: { email: string } }[]>('/orgs/members')).data;
    const membership = members.find((m) => m.user.email === sara.email)!;
    await page.goto(`/team?member=${membership.id}`);
    await page.getByLabel('Custom role').selectOption({ label: 'Billing' });
    await expect.poll(async () => (await sara.api<{ customRole: { name: string } | null }>('/auth/me')).data.customRole?.name).toBe('Billing');

    // Exactly what it gives: billing, and teams to look at but not change.
    expect((await sara.api('/billing/invoices')).status).toBe(200);
    expect((await sara.api('/orgs/teams')).status).toBe(200);
    expect((await sara.api('/orgs/teams', { body: { name: 'Sales' } })).status).toBe(403);
    expect((await sara.api('/webhooks')).status).toBe(403);
    // Never roles: not her own, not anyone's.
    expect((await sara.api('/orgs/roles/assign', { method: 'PUT', body: { membershipId: membership.id, customRoleId: null } })).status).toBe(403);
    expect((await sara.api(`/orgs/members/${membership.id}`, { method: 'PATCH', body: { role: 'ADMIN' } })).status).toBe(403);

    // The owner can't give one to themselves or to an owner.
    const mine = members.find((m) => m.user.email === account.email)!;
    const roles = (await account.api<{ id: string; name: string }[]>('/orgs/roles')).data;
    const billing = roles.find((r) => r.name === 'Billing')!;
    expect((await account.api('/orgs/roles/assign', { method: 'PUT', body: { membershipId: mine.id, customRoleId: billing.id } })).status).toBe(403);

    // Deleted: Sara is an employee again.
    page.once('dialog', (d) => void d.accept());
    await page.goto('/team?view=roles');
    await page.getByRole('button', { name: 'Delete Billing' }).click();
    await expect(page.getByTestId('custom-role')).toHaveCount(0);
    expect((await sara.api('/billing/invoices')).status).toBe(403);
    expect((await sara.api<{ role: string; customRole: unknown }>('/auth/me')).data).toMatchObject({ role: 'EMPLOYEE', customRole: null });
  } finally {
    await closeAccount(sara);
  }
});
