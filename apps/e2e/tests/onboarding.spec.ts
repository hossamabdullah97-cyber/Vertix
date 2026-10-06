import { closeAccount, expect, newAccount, signIn, test } from './support';

test('a new account is welcomed once, and the guide follows it to a live card', async ({ page }) => {
  const a = await newAccount('Mona Adel', { welcome: true });
  try {
    await signIn(page, a);

    // The welcome, once, with the first step.
    const welcome = page.getByRole('dialog', { name: 'Welcome, Mona' });
    await expect(welcome).toBeVisible();
    await expect(welcome).toContainText("Your team's digital business cards");
    await welcome.getByRole('button', { name: "I'll look around first" }).click();
    await expect(welcome).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('dialog', { name: 'Welcome, Mona' })).toHaveCount(0);

    // The guide in the sidebar, on every page.
    const guide = page.getByTestId('getting-started');
    await expect(guide).toContainText('0 of 9 done');
    await expect(guide).toContainText('Next: Create your card');

    // Steps tick themselves off from what the account has.
    const card = await a.api<{ id: string }>('/cards', { body: { templateId: 'swiss-indigo', fullName: 'Mona Adel', title: 'Sales', phone: '+201001234567' } });
    await a.api(`/cards/${card.data.id}`, { method: 'PATCH', body: { isPublished: true } });
    await page.goto('/leads');
    await expect(guide).toContainText(/[2-9] of 9 done/);

    // The list opens from the sidebar and leads to each step.
    await guide.click();
    const list = page.getByRole('dialog', { name: 'Getting started' });
    await expect(list.getByRole('link', { name: /Create your card/ })).toBeVisible();
    await list.getByRole('link', { name: /Invite your team/ }).click();
    await expect(page).toHaveURL(/\/team/);

    // Hidden, it stays hidden (on every device), and the home page can bring it back.
    await guide.click();
    await page.getByRole('button', { name: 'Hide the guide' }).click();
    await expect(guide).toHaveCount(0);
    expect((await a.api<{ dismissed: boolean }>('/account/onboarding')).data.dismissed).toBe(true);
    await page.goto('/dashboard');
    await page.getByRole('button', { name: /Show setup checklist/ }).click();
    await expect(page.getByTestId('getting-started')).toBeVisible();
  } finally {
    await closeAccount(a);
  }
});
