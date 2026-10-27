import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { API, call, closeAccount, confirmEmail, expect, newAccount, PASSWORD, signIn, test, type Account } from './support';

const DB = (process.env.DATABASE_URL ?? 'postgresql://vertex:vertex@localhost:5432/vertex_connect').split('?')[0]!;
const sql = (q: string) => execFileSync('psql', [DB, '-tAc', q]).toString().trim();

/** A chip the platform admin registered, as the admin console would. */
function registeredChip(): string {
  const uid = randomBytes(7).toString('hex').toUpperCase().match(/../g)!.join(':');
  sql(`INSERT INTO nfc_chips (id, uid, status, "updatedAt") VALUES ('e2e${uid.replace(/:/g, '')}', '${uid}', 'AVAILABLE', now())`);
  return uid;
}
const registry = (uid: string) => sql(`SELECT status || '|' || coalesce("allocatedToOrgId", '') FROM nfc_chips WHERE uid = '${uid}'`);

/** Someone who signed up for themselves: a personal workspace, which they own. */
async function personalAccount(name: string): Promise<Account> {
  const email = `e2e-${Date.now()}-${randomBytes(3).toString('hex')}@example.test`;
  const r = await call<{ accessToken: string }>('/auth/register', { body: { email, password: PASSWORD, name, kind: 'personal' } });
  expect(r.status, JSON.stringify(r.data)).toBe(201);
  const claims = JSON.parse(Buffer.from(r.data.accessToken.split('.')[1]!, 'base64url').toString());
  const a = { email, password: PASSWORD, name, token: r.data.accessToken, userId: claims.sub, orgId: claims.orgId } as Account;
  a.api = (path, opts = {}) => call(path, { ...opts, token: a.token, orgId: a.orgId });
  await a.api('/account/onboarding', { method: 'PATCH', body: { welcomed: true } });
  return a;
}

test('a personal account removes a tapped chip after a warning, and it can be added again, here or to a new account', async ({ page }) => {
  const uid = registeredChip();
  const first = await personalAccount('Chip Owner');
  let second: Account | null = null;
  try {
    expect((await first.api('/nfc/tags', { body: { uid } })).status).toBe(201);
    await fetch(`${API}/t/${encodeURIComponent(uid)}`, { redirect: 'manual' });
    const [tag] = (await first.api<{ id: string; activationCount: number }[]>('/nfc/tags')).data;
    expect(tag!.activationCount).toBeGreaterThan(0);

    await signIn(page, first);
    await page.goto('/tags');
    await page.getByRole('row').nth(1).click();
    await page.getByRole('button', { name: 'Remove chip' }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText('Remove this chip from your account?');
    await expect(dialog).toContainText('can’t be undone');
    await expect(dialog).toContainText('to this account or to a new one');
    await dialog.getByRole('button', { name: 'Remove chip' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Chip removed' })).toBeVisible();

    // Still in the platform's registry, and no longer held for anyone.
    expect(registry(uid)).toBe('AVAILABLE|');
    // A new account can take it.
    second = await personalAccount('Chip Next');
    const claimed = await second.api<{ id: string }>('/nfc/tags', { body: { uid } });
    expect(claimed.status, JSON.stringify(claimed.data)).toBe(201);
    expect((await second.api(`/nfc/tags/${claimed.data.id}`, { method: 'DELETE' })).status).toBe(200);
    // And so can the first one again.
    expect((await first.api('/nfc/tags', { body: { uid } })).status).toBe(201);
  } finally {
    await closeAccount(first);
    if (second) await closeAccount(second);
    sql(`DELETE FROM nfc_chips WHERE uid = '${uid}'`);
  }
});

test('in a team only the owner removes a chip, and it stays with the team to give to any member', async ({ browser, account }) => {
  const uid = registeredChip();
  confirmEmail(account);
  const manager = await newAccount('Chip Manager');
  const outsider = await newAccount('Chip Outsider');
  try {
    expect((await account.api('/orgs/members/invite', { body: { email: manager.email, role: 'MANAGER' } })).status).toBe(201);
    expect((await manager.api(`/invitations/${account.orgId}/accept`, { method: 'POST' })).status).toBeLessThan(300);
    manager.orgId = account.orgId;
    const created = await account.api<{ id: string }>('/nfc/tags', { body: { uid } });
    expect(created.status).toBe(201);

    // A manager is told who can, and the API says the same.
    const page = await browser.newPage();
    await signIn(page, manager);
    await page.goto('/tags');
    await page.getByRole('row').nth(1).click();
    await expect(page.getByText('Only the workspace owner can remove a chip.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Remove chip' })).toHaveCount(0);
    await page.close();
    const refused = await manager.api<{ message: string }>(`/nfc/tags/${created.data.id}`, { method: 'DELETE' });
    expect(refused.status).toBe(403);
    expect(refused.data.message).toContain('Only the workspace owner');

    expect((await account.api(`/nfc/tags/${created.data.id}`, { method: 'DELETE' })).status).toBe(200);
    // Free again, but kept for this team: another workspace cannot take it.
    expect(registry(uid)).toBe(`AVAILABLE|${account.orgId}`);
    expect((await outsider.api('/nfc/tags', { body: { uid } })).status).toBe(409);
    const again = await account.api('/nfc/tags', { body: { uid, assignedUserId: manager.userId } });
    expect(again.status, JSON.stringify(again.data)).toBe(201);
  } finally {
    await closeAccount(manager);
    await closeAccount(outsider);
    sql(`DELETE FROM nfc_tags WHERE uid = '${uid}'`);
    sql(`DELETE FROM nfc_chips WHERE uid = '${uid}'`);
  }
});
