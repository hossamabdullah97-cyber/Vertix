import { API_ENDPOINTS, WEBHOOK_EVENT_DOCS } from '@vertex/shared/dist/api-reference';
import { expect, test, useArabic } from './support';

test('the API documentation is open to anyone, in both languages', async ({ page, pageErrors }) => {
  await page.goto('/developers');
  await expect(page.getByRole('heading', { name: 'Vertex Connect API', level: 1 })).toBeVisible();
  await expect(page.getByTestId('endpoint')).toHaveCount(API_ENDPOINTS.length);
  await expect(page.getByTestId('webhook-events').locator('dt')).toHaveCount(WEBHOOK_EVENT_DOCS.length);

  // Each endpoint can be linked to, and shows a request to copy.
  await page.getByRole('navigation', { name: 'On this page' }).getByRole('link', { name: 'Update a lead' }).click();
  await expect(page).toHaveURL(/#updateLead$/);
  const update = page.locator('#updateLead');
  await expect(update).toContainText('PATCH');
  await expect(update).toContainText('/leads/{id}');
  await expect(update).toContainText('crm:write');
  await expect(update.locator('pre').first()).toContainText('curl -X PATCH');

  // The OpenAPI file is a click away.
  const href = await page.getByRole('link', { name: 'OpenAPI file' }).last().getAttribute('href');
  expect(href).toMatch(/\/api\/openapi\.json$/);

  await useArabic(page);
  await page.goto('/developers');
  await expect(page.getByRole('heading', { name: /واجهة Vertex Connect البرمجية/, level: 1 })).toBeVisible();
  await expect(page.locator('#createLead')).toContainText('إضافة عميل');
  // Code stays left to right on a right-to-left page.
  await expect(page.locator('#createLead pre').first()).toHaveAttribute('dir', 'ltr');
  expect(pageErrors).toEqual([]);
});
