import { execFileSync } from 'node:child_process';
import type { Page } from '@playwright/test';
import { closeAccount, confirmEmail, expect, newAccount, signIn, test, type Account } from './support';

const DB = (process.env.DATABASE_URL ?? 'postgresql://vertex:vertex@localhost:5432/vertex_connect').split('?')[0]!;
const safe = (id: string) => id.replace(/[^a-z0-9]/gi, '');

const PAGES = ['/dashboard', '/cards', '/leads', '/tags', '/analytics', '/team', '/team?view=roles', '/workspace', '/integrations', '/billing'];

/** Opens each page as this person and returns what was refused, and which pages said they are not for them. */
async function walk(page: Page) {
  const refused: string[] = [];
  page.on('response', (r) => {
    if (r.url().includes('/api/') && r.status() === 403) refused.push(`${new URL(page.url()).pathname} → ${r.request().method()} ${new URL(r.url()).pathname}`);
  });
  const closed: string[] = [];
  for (const p of PAGES) {
    await page.goto(p);
    await page.waitForLoadState('networkidle');
    if (await page.getByTestId('page-no-access').count()) closed.push(p);
  }
  return { refused, closed };
}

test('each role is shown its own part of the workspace, and asks for nothing it would be refused', async ({ browser, account }) => {
  test.setTimeout(240_000);
  confirmEmail(account);
  execFileSync('psql', [DB, '-c', `UPDATE organizations SET plan = 'BUSINESS' WHERE id = '${safe(account.orgId)}'`]);
  await account.api('/orgs/teams', { body: { name: 'Sales' } });
  const people: Record<'manager' | 'member' | 'teamsOnly', Account> = {} as never;
  try {
    for (const [name, role] of [['manager', 'MANAGER'], ['member', 'EMPLOYEE'], ['teamsOnly', 'EMPLOYEE']] as const) {
      const a = await newAccount(`Roles ${name}`);
      expect((await account.api('/orgs/members/invite', { body: { email: a.email, role } })).status).toBe(201);
      expect((await a.api(`/invitations/${account.orgId}/accept`, { method: 'POST' })).status).toBeLessThan(300);
      a.orgId = account.orgId;
      people[name] = a;
    }
    // A custom role that sees the teams but not the people.
    const role = await account.api<{ id: string }>('/orgs/roles', { body: { name: 'Team lead', base: 'EMPLOYEE', capabilities: ['teams:basic'] } });
    const members = (await account.api<{ id: string; user: { email: string } }[]>('/orgs/members')).data;
    await account.api('/orgs/roles/assign', { method: 'PUT', body: { membershipId: members.find((m) => m.user.email === people.teamsOnly.email)!.id, customRoleId: role.data.id } });

    const expected = {
      manager: { nav: ['Team', 'Integrations', 'Settings'], closed: ['/billing'] },
      member: { nav: [], closed: ['/team', '/team?view=roles', '/workspace', '/integrations', '/billing'] },
      teamsOnly: { nav: ['Team'], closed: ['/workspace', '/integrations', '/billing'] },
    };
    for (const [who, acct] of Object.entries(people) as [keyof typeof expected, Account][]) {
      await test.step(who, async () => {
        const ctx = await browser.newContext();
        const page = await ctx.newPage();
        await signIn(page, acct);
        await page.evaluate((id) => localStorage.setItem('vertex_org_id', id), account.orgId);
        await page.goto('/dashboard');
        // The menu offers the management pages once it knows the person's role.
        await page.waitForLoadState('networkidle');
        const nav = await page.locator('aside nav a').allInnerTexts();
        for (const item of ['Team', 'Integrations', 'Settings']) {
          expect(nav.includes(item), `${who} sees ${item} in the menu`).toBe(expected[who].nav.includes(item));
        }
        const { refused, closed } = await walk(page);
        expect(closed, `${who}: pages that say they are not theirs`).toEqual(expected[who].closed);
        expect(refused, `${who}: requests the API refused`).toEqual([]);
        await ctx.close();
      });
    }

    // Someone who sees only the teams lands on them, not on an empty list of people.
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await signIn(page, people.teamsOnly);
    await page.evaluate((id) => localStorage.setItem('vertex_org_id', id), account.orgId);
    await page.goto('/team');
    await expect(page.getByText('Sales').first()).toBeVisible();
    await expect(page.getByRole('tab', { name: /Members/ })).toHaveCount(0);
    await ctx.close();
  } finally {
    for (const a of Object.values(people)) await closeAccount(a).catch(() => undefined);
  }
});
