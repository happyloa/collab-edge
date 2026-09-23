import { test, expect } from '@playwright/test';
test('public demo preserves conflicts, restores cards and never calls an API', async ({
  page,
}) => {
  const apiRequests: string[] = [];
  const errors: string[] = [];
  page.on('request', (request) => {
    if (
      ['fetch', 'xhr', 'websocket'].includes(request.resourceType()) ||
      request.url().includes('workers.dev')
    )
      apiRequests.push(request.url());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('./');
  await page
    .getByRole('button', { name: 'Write the launch story', exact: true })
    .click();
  await page.getByLabel('Title', { exact: true }).fill('My preserved draft');
  await page.getByRole('button', { name: 'Simulate teammate edit' }).click();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('alert')).toContainText(
    'Your draft is preserved',
  );
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue(
    'My preserved draft',
  );
  await page.getByRole('button', { name: 'Retry my draft' }).click();
  await page
    .getByRole('button', { name: 'My preserved draft', exact: true })
    .click();
  await page.getByRole('button', { name: 'Archive card', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'My preserved draft', exact: true }),
  ).toHaveCount(0);
  await page.getByLabel('Archived cards', { exact: true }).check();
  await page.getByRole('button', { name: 'Restore card' }).click();
  await page.getByLabel('Archived cards', { exact: true }).uncheck();
  await expect(
    page.getByRole('button', { name: 'My preserved draft', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Reset demo' }).click();
  await expect(
    page.getByRole('button', { name: 'Write the launch story', exact: true }),
  ).toBeVisible();
  await page.getByLabel('Language / 語言').selectOption('zh-TW');
  await expect(page.getByRole('button', { name: '重設展示' })).toBeVisible();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-TW');
  const fonts = await page.evaluate(async () => {
    await document.fonts.ready;
    return document.fonts.check('16px "Noto Sans TC"');
  });
  expect(fonts).toBe(true);
  await page.screenshot({
    path: 'docs/screenshots/public-demo.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(apiRequests).toEqual([]);
  expect(errors).toEqual([]);
});
