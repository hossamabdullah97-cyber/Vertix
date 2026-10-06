import { execFileSync } from 'node:child_process';
import { expect, publishedCard, signIn, test } from './support';

const DB = (process.env.DATABASE_URL ?? 'postgresql://vertex:vertex@localhost:5432/vertex_connect').split('?')[0]!;
const views = (cardId: string) =>
  Number(execFileSync('psql', [DB, '-At', '-c', `SELECT count(*) FROM events WHERE "cardId" = '${cardId.replace(/[^a-z0-9]/gi, '')}' AND type = 'VIEW'`]).toString().trim());

test('a visitor’s look at a card counts once, and its own people are not counted', async ({ page, browser, account }) => {
  const card = await publishedCard(account, 'Hossam Abdullah');

  // A visitor opens it, reloads, and comes back: one view.
  const ctx = await browser.newContext();
  const visitor = await ctx.newPage();
  await visitor.goto(`/c/${card.slug}`);
  await expect.poll(() => views(card.id)).toBe(1);
  await visitor.reload();
  await visitor.goto(`/c/${card.slug}`);
  await visitor.waitForLoadState('networkidle');
  // Give any extra report time to arrive before counting.
  await visitor.waitForTimeout(1000);
  expect(views(card.id)).toBe(1);
  await ctx.close();

  // The owner, signed in, opens their own card: nothing is counted.
  await signIn(page, account);
  await page.goto(`/c/${card.slug}`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  expect(views(card.id)).toBe(1);
});
