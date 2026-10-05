import { call, expect, signIn, test } from './support';

/** A card made in one's own workspace, moved into the company with what it brought in. */

test('a card moves from one’s own workspace into the company, with its leads', async ({ page, account }) => {
  await account.api('/orgs/current', { method: 'PATCH', body: { name: 'Nile Trading' } });
  const company = (await account.api<{ org: { id: string; slug: string } }[]>('/orgs')).data[0]!.org;
  const personal = (await account.api<{ id: string; slug: string; name: string }>('/orgs/personal', { body: {} })).data;
  const inPersonal = (path: string, opts: { method?: string; body?: unknown } = {}) => call(path, { ...opts, token: account.token, orgId: personal.id });

  // A published card in the personal workspace, with a lead from it.
  const card = (await inPersonal('/cards', { body: { templateId: 'swiss-indigo', fullName: 'Mona Adel', title: 'Designer' } })).data as { id: string; slug: string };
  expect((await inPersonal(`/cards/${card.id}`, { method: 'PATCH', body: { isPublished: true } })).status).toBe(200);
  expect((await call('/leads/capture', { body: { slug: card.slug, name: 'Laila Hassan', email: 'laila@example.com', visitorId: `e2e-${Date.now()}-${Math.random().toString(36).slice(2)}` } })).status).toBe(201);

  await signIn(page, account);
  await page.goto(`/cards/${card.id}?w=${personal.slug}`);
  await page.getByRole('tab', { name: 'Settings' }).or(page.getByRole('button', { name: 'Settings', exact: true })).first().click();
  await page.getByRole('heading', { name: 'Move to another workspace' }).scrollIntoViewIfNeeded();
  await page.locator('label', { hasText: 'Nile Trading' }).click();
  await page.getByRole('button', { name: 'Move to Nile Trading…' }).click();
  await expect(page.getByText('Its 1 lead goes with it, with its history and tasks.')).toBeVisible();
  await page.getByRole('button', { name: 'Move the card' }).click();

  // Opened where it now lives.
  await expect(page).toHaveURL(new RegExp(`/cards/${card.id}\\?w=${company.slug}`));
  const cards = (await account.api<{ id: string }[]>('/cards')).data;
  expect(cards.map((c) => c.id)).toContain(card.id);
  const leads = (await account.api<{ name: string; card: { slug: string } | null }[]>('/leads')).data;
  expect(leads.find((l) => l.name === 'Laila Hassan')?.card?.slug).toBe(card.slug);
  // And it is gone from the personal workspace, its address unchanged.
  expect(((await inPersonal('/cards')).data as { id: string }[]).map((c) => c.id)).not.toContain(card.id);
  expect((await call(`/c/${card.slug}`)).status).toBe(200);
});
