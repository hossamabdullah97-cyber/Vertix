import { expect, publishedCard, signIn, test } from './support';

test.describe('from a card to a lead', () => {
  test('a visitor sends their details from the card, and the owner finds the lead waiting', async ({ page, browser, account }) => {
    const card = await publishedCard(account, 'Hana Owner');

    // The visitor, on their own phone: no account, nothing shared with the owner.
    const visitor = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const v = await visitor.newPage();
    await v.goto(`/c/${card.slug}`);
    await expect(v.getByText('Hana Owner').first()).toBeVisible();
    await expect(v.getByRole('link', { name: 'Save contact' })).toBeVisible();
    await v.getByRole('button', { name: 'Exchange' }).click();
    await v.locator('input[autocomplete=name]').fill('Youssef Visitor');
    await v.locator('input[type=email]').fill('youssef.visitor@example.test');
    await v.locator('input[type=tel]').fill('01009998877');
    await v.locator('input[autocomplete=organization]').fill('Nile Foods');
    await v.getByRole('button', { name: 'Send my details' }).click();

    // The lead is there for the owner, credited to the card.
    await expect
      .poll(async () => (await account.api<{ name: string; source: string; card: { slug: string } | null }[]>('/leads')).data.find((l) => l.name === 'Youssef Visitor'))
      .toMatchObject({ source: 'card_form', card: { slug: card.slug } });
    await visitor.close();

    await signIn(page, account);
    await page.goto('/leads');
    await expect(page.getByText('Youssef Visitor').first()).toBeVisible();
    await page.getByText('Youssef Visitor').first().click();
    // The contact details are editable in the panel: read the fields' values.
    await expect.poll(() => page.getByRole('dialog').locator('input').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value))).toContain('youssef.visitor@example.test');
    await expect(page.getByRole('dialog').getByText(/Nobody has reached out yet/)).toBeVisible();
  });

  test('a card that is not published is not shown to anyone', async ({ page, account }) => {
    const created = await account.api<{ slug: string }>('/cards', { body: { templateId: 'swiss-indigo', fullName: 'Hidden Draft' } });
    await page.goto(`/c/${created.data.slug}`);
    await expect(page.getByRole('heading', { name: 'Card not found' })).toBeVisible();
    await expect(page.getByText('Hidden Draft')).toHaveCount(0);
    // The card page streams, so the status is sent before the card is looked up; search engines are kept off by this instead.
    await expect(page.locator('meta[name=robots][content=noindex]').first()).toBeAttached();
  });
});
