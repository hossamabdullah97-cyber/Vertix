import { closeAccount, confirmEmail, expect, newAccount, signIn, test } from './support';

test('a note names a teammate with @, and they are told and find it under "Mentioning me"', async ({ page, account }) => {
  // A colleague who manages leads in the same workspace.
  confirmEmail(account);
  const mona = await newAccount('Mona Adel');
  try {
    expect((await account.api('/orgs/members/invite', { body: { email: mona.email, role: 'MANAGER' } })).status).toBe(201);
    expect((await mona.api(`/invitations/${account.orgId}/accept`, { method: 'POST' })).status).toBeLessThan(300);
    mona.orgId = account.orgId;

    const lead = await account.api<{ id: string }>('/leads', { body: { name: 'Hana Fathy', company: 'Studio' } });
    await signIn(page, account);
    await page.goto(`/leads?lead=${lead.data.id}`);
    await page.getByRole('dialog', { name: 'Lead details' }).getByRole('tab', { name: 'Activity' }).click();

    const box = page.getByPlaceholder('Write a note… Type @ to mention a teammate');
    await box.fill('Can you call them tomorrow, @Mo');
    await page.getByRole('option', { name: /Mona Adel/ }).click();
    await box.press('End');
    await box.pressSequentially('? Thanks');
    await expect(box).toHaveValue('Can you call them tomorrow, @Mona Adel ? Thanks');
    await page.getByRole('button', { name: 'Log' }).click();

    const note = page.getByTestId('activity').first();
    await expect(note).toContainText('Note · You');
    await expect(note.locator('span', { hasText: '@Mona Adel' })).toBeVisible();

    // Mona is told, with a link to the lead.
    await expect.poll(async () => JSON.stringify((await mona.api('/notifications')).data)).toContain('lead.mentioned');
    const mine = await mona.api<{ note: string; author: { name: string } }[]>('/leads/notes?filter=mentions');
    expect(mine.data).toHaveLength(1);
    expect(mine.data[0]).toMatchObject({ note: 'Can you call them tomorrow, @Mona Adel ? Thanks', author: { name: 'E2E Owner' } });

    // The writer can change it; Mona cannot.
    const id = (await account.api<any[]>('/leads/notes?filter=mine')).data[0].id;
    expect((await mona.api(`/leads/${lead.data.id}/notes/${id}`, { method: 'PATCH', body: { note: 'mine now' } })).status).toBe(403);

    // The team's notes tab lists it, and opens the lead.
    await page.goto('/leads');
    await page.getByRole('tab', { name: 'Notes' }).click();
    await expect(page.getByTestId('team-note')).toHaveCount(1);
    await page.getByTestId('team-note').getByRole('button', { name: 'Hana Fathy' }).click();
    await expect(page.getByRole('dialog', { name: 'Lead details' })).toContainText('Hana Fathy');
  } finally {
    await closeAccount(mona);
  }
});
