import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { expect, publishedCard, signIn, test, WEB } from './support';

const DB = (process.env.DATABASE_URL ?? 'postgresql://vertex:vertex@localhost:5432/vertex_connect').split('?')[0]!;
const sql = (q: string) => execFileSync('psql', [DB, '-tAc', q]).toString().trim();

test('a chip counts the people who tap it, apart from repeats, and never its own people', async ({ page, browser, account }) => {
  test.setTimeout(120_000);
  const uid = randomBytes(7).toString('hex').toUpperCase().match(/../g)!.join(':');
  sql(`INSERT INTO nfc_chips (id, uid, status, "updatedAt") VALUES ('e2e${uid.replace(/:/g, '')}', '${uid}', 'AVAILABLE', now())`);
  try {
    const card = await publishedCard(account, 'Tap Counter');
    const tag = await account.api<{ id: string }>('/nfc/tags', { body: { uid } });
    expect(tag.status).toBe(201);
    expect((await account.api(`/nfc/tags/${tag.data.id}/assign`, { body: { cardId: card.id } })).status).toBeLessThan(300);
    const counts = async () => {
      const t = (await account.api<{ id: string; activationCount: number; repeatTaps: number }[]>('/nfc/tags')).data.find((x) => x.id === tag.data.id)!;
      return { people: t.activationCount, repeats: t.repeatTaps };
    };
    const tapFrom = async (p: typeof page) => {
      await p.goto(`${WEB}/t/${encodeURIComponent(uid)}`);
      await expect(p).toHaveURL(new RegExp(`/c/${card.slug}`));
    };

    // The owner, on a browser they are signed in on, trying their own chip.
    const claimed = page.waitForResponse((r) => r.url().endsWith('/track/device') && r.request().method() === 'POST');
    await signIn(page, account);
    await claimed;
    await tapFrom(page);
    expect(await counts()).toEqual({ people: 0, repeats: 0 });

    // Someone else: one person reached.
    const visitor = await browser.newContext();
    const theirs = await visitor.newPage();
    await tapFrom(theirs);
    expect(await counts()).toEqual({ people: 1, repeats: 0 });

    // The same person again later (not moments later, which is the same visit): a repeat.
    sql(`UPDATE events SET "createdAt" = now() - interval '2 hours' WHERE "tagId" = '${tag.data.id}'`);
    await tapFrom(theirs);
    expect(await counts()).toEqual({ people: 1, repeats: 1 });

    // A second person.
    const other = await browser.newContext();
    await tapFrom(await other.newPage());
    expect(await counts()).toEqual({ people: 2, repeats: 1 });

    // The reports count people, with the repeats beside them.
    const from = new Date(Date.now() - 86_400_000).toISOString();
    const to = new Date(Date.now() + 60_000).toISOString();
    const ov = (await account.api<{ totals: Record<string, number>; repeatTaps: number }>(`/analytics/overview?from=${from}&to=${to}`)).data;
    expect(ov.totals.NFC_SCAN).toBe(2);
    expect(ov.repeatTaps).toBe(1);
    const chips = (await account.api<{ tagId: string; scans: number; repeats: number }[]>(`/analytics/nfc-tags?from=${from}&to=${to}`)).data;
    expect(chips.find((c) => c.tagId === tag.data.id)).toMatchObject({ scans: 2, repeats: 1 });

    await page.goto('/tags');
    await page.getByRole('row').nth(1).click();
    await expect(page.getByText('+1 repeat tap by the same person')).toBeVisible();
    await visitor.close();
    await other.close();
  } finally {
    sql(`DELETE FROM nfc_tags WHERE uid = '${uid}'`);
    sql(`DELETE FROM nfc_chips WHERE uid = '${uid}'`);
  }
});
