import { execFileSync } from 'node:child_process';
import { expect } from '@playwright/test';
import { signIn, test } from './support';

// The Studio's preview shows the card as visitors see it, whichever tab is open:
// payment links (kept by their own manager) and the badge a paid plan earns included.
test('the Studio preview shows payment links and the verified badge on every tab', async ({ page, account }) => {
  const db = (process.env.DATABASE_URL ?? 'postgresql://vertex:vertex@localhost:5432/vertex_connect').split('?')[0]!;
  execFileSync('psql', [db, '-c', `UPDATE organizations SET plan = 'PRO' WHERE id = '${account.orgId.replace(/[^a-z0-9]/gi, '')}'`]);
  const created = await account.api<{ id: string }>('/cards', { body: { templateId: 'swiss-indigo', fullName: 'Preview Person', title: 'Owner' } });
  const id = created.data.id;
  await account.api(`/cards/${id}/payment-links`, { body: { platform: 'instapay', displayName: 'My InstaPay', url: 'https://ipn.eg/S/preview/instapay/abc' } });

  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, account);
  await page.goto(`/cards/${id}?tab=profile`);
  const preview = page.locator('aside');
  await expect(preview.getByText('My InstaPay')).toBeVisible();
  await expect(preview.getByText('preview@instapay')).toBeVisible();
  await expect(preview.getByRole('img', { name: 'Verified account' }).first()).toBeVisible();
});
