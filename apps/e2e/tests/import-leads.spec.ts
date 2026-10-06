import { expect, signIn, test } from './support';

test('leads come in from a spreadsheet, each row checked first, and those already here are not doubled', async ({ page, account }) => {
  // One lead already here, by phone.
  const existing = await account.api('/leads', { body: { name: 'Omar Saeed', phone: '+20 111 234 5678' } });
  expect(existing.status).toBe(201);

  const csv = [
    'الاسم,الشركة,البريد الإلكتروني,الهاتف,المرحلة,الاهتمام,القيمة,ملاحظات',
    'منى عادل,شركة النيل,mona@nile.example,01001234567,تم التواصل,ساخن,"25,000",قابلناها في المعرض',
    'Omar S.,Delta Co,omar@delta.example,01112345678,,,,',
    'Bad Email,,not-an-email,,,,,',
    'Hana Fathy,Studio,hana@studio.example,,Hot prospect,Warm,1200,',
  ].join('\r\n');

  await signIn(page, account);
  await page.goto('/leads');
  await page.getByRole('button', { name: 'Import' }).click();
  await page.getByTestId('import-file').setInputFiles({ name: 'expo-leads.csv', mimeType: 'text/csv', buffer: Buffer.from('﻿' + csv) });

  const rows = page.getByTestId('import-row');
  await expect(rows).toHaveCount(4);
  // Problems first, then rows with a note, then new, then those already here.
  await expect(rows.nth(0)).toContainText("Email isn't valid");
  await expect(rows.nth(1)).toContainText("Stage isn't in your pipeline");
  await expect(rows.filter({ hasText: 'Already here' })).toHaveCount(1);

  // Filling in the one already here adds its email and company.
  await page.getByLabel("Fill in what they're missing").check();
  await expect(rows.filter({ hasText: 'Will fill in' })).toHaveCount(1);
  await page.getByRole('button', { name: 'Import 3 leads' }).click();
  await expect(page.getByText('Import finished')).toBeVisible();
  await page.getByRole('button', { name: 'Done', exact: true }).click();

  const leads = (await account.api<any[]>('/leads')).data;
  expect(leads).toHaveLength(3);
  const mona = leads.find((l) => l.name === 'منى عادل');
  expect(mona).toMatchObject({ company: 'شركة النيل', phone: '01001234567', temperature: 'HOT', value: 25000, source: 'import' });
  const stages = (await account.api<any[]>('/leads/stages')).data;
  expect(stages.find((s) => s.id === mona.stageId)?.name).toBe('Contacted');
  const omar = leads.find((l) => l.id === existing.data.id);
  expect(omar).toMatchObject({ name: 'Omar Saeed', email: 'omar@delta.example', company: 'Delta Co' });
  await expect(page.getByText('Hana Fathy').first()).toBeVisible();
});
