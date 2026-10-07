import { execFileSync } from 'node:child_process';
import { expect, publishedCard, signIn, test } from './support';

const db = (process.env.DATABASE_URL ?? 'postgresql://vertex:vertex@localhost:5432/vertex_connect').split('?')[0]!;
const sql = (q: string) => execFileSync('psql', [db, '-At', '-c', q]).toString().trim();
const safe = (id: string) => id.replace(/[^a-z0-9]/gi, '');

test('a lead’s whole story is in one place, and its owner hears when they come back to the card', async ({ page, browser, account }) => {
  const card = await publishedCard(account, 'Hana Owner');

  // The visitor looks at the card on their phone, saves the contact, and leaves their details.
  const visitor = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const v = await visitor.newPage();
  await v.goto(`/c/${card.slug}`);
  await expect(v.getByText('Hana Owner').first()).toBeVisible();
  const saved = v.waitForEvent('download').catch(() => null);
  await v.getByRole('link', { name: 'Save contact' }).click();
  await saved;
  await v.getByRole('button', { name: 'Exchange' }).click();
  await v.locator('input[autocomplete=name]').fill('Laila Visitor');
  await v.locator('input[type=email]').fill('laila.visitor@example.test');
  await v.locator('input[type=tel]').fill('01009998866');
  await v.getByRole('button', { name: 'Send my details' }).click();
  const find = async () => (await account.api<{ id: string; name: string }[]>('/leads')).data.find((l) => l.name === 'Laila Visitor');
  await expect.poll(find, { timeout: 15_000 }).toBeTruthy();
  const lead = (await find())!;

  // That was two days ago.
  sql(`UPDATE leads SET "createdAt" = "createdAt" - interval '2 days' WHERE id = '${safe(lead.id)}'`);
  sql(`UPDATE events SET "createdAt" = "createdAt" - interval '2 days' WHERE "cardId" = '${safe(card.id)}'`);

  // Today they open the card again: the owner is told, once.
  await v.goto(`/c/${card.slug}`);
  await expect(v.getByText('Hana Owner').first()).toBeVisible();
  const told = async () => (await account.api<{ type: string; metadata: { leadId?: string } }[] | { items: { type: string; metadata: { leadId?: string } }[] }>('/notifications')).data;
  const returned = async () => {
    const d = await told();
    const list = Array.isArray(d) ? d : d.items;
    return list.filter((n) => n.type === 'lead.returned' && n.metadata?.leadId === lead.id).length;
  };
  await expect.poll(returned, { timeout: 15_000 }).toBe(1);
  await v.reload();
  await expect(v.getByText('Hana Owner').first()).toBeVisible();
  await visitor.close();

  // The timeline has both visits, the second marked as a return, and what was done on the first.
  const timeline = await account.api<{ items: { kind: string; returning?: boolean; actions?: { type: string }[] }[]; summary: { visits: number; returns: number } }>(`/leads/${lead.id}/timeline`);
  expect(timeline.status).toBe(200);
  expect(timeline.data.summary).toMatchObject({ visits: 2, returns: 1 });
  const visits = timeline.data.items.filter((i) => i.kind === 'visit');
  expect(visits.map((x) => x.returning)).toEqual([true, false]);
  expect(visits[1]!.actions?.map((a) => a.type)).toContain('SAVE');
  expect(await returned()).toBe(1);

  // The owner opens the lead: told they came back, and the story reads in order.
  await account.api(`/leads/${lead.id}/activities`, { body: { type: 'CALL', note: 'Talked about the offer' } });
  await account.api('/tasks', { body: { title: 'Send the offer', leadId: lead.id } });
  await signIn(page, account);
  await page.goto(`/leads?lead=${lead.id}`);
  const drawer = page.getByRole('dialog');
  await drawer.getByTestId('lead-back-on-card').click();
  await expect(drawer.getByTestId('timeline-stat-visits')).toContainText('2');
  await expect(drawer.getByTestId('timeline-stat-visits')).toContainText('Came back once');
  // Showing only card visits, as the banner asked.
  await expect(drawer.getByTestId('timeline-visit')).toHaveCount(2);
  await expect(drawer.getByTestId('timeline-visit').first()).toContainText('Came back to Hana Owner’s card');
  await expect(drawer.getByTestId('timeline-visit').last()).toContainText('Saved your contact');
  await expect(drawer.getByTestId('activity')).toHaveCount(0);

  await drawer.getByRole('button', { name: 'All', exact: true }).click();
  await expect(drawer.getByTestId('activity').filter({ hasText: 'Talked about the offer' })).toBeVisible();
  await expect(drawer.getByTestId('timeline-task').filter({ hasText: 'Send the offer' })).toBeVisible();
  await expect(drawer.getByTestId('timeline-created')).toBeVisible();
  await expect(drawer.getByTestId('timeline-stat-contacts')).toContainText('1');
  await drawer.getByRole('button', { name: 'Conversations' }).click();
  await expect(drawer.getByTestId('timeline-visit')).toHaveCount(0);
  await expect(drawer.getByTestId('activity')).toHaveCount(1);
});
