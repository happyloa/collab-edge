import { test, expect } from '@playwright/test';

test('language persists across routes and reloads without losing drafts or reconnecting the board', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole('combobox', { name: 'Language / 語言' })
    .selectOption('zh-TW');
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-TW');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    '讓好點子成真',
  );
  await page.getByRole('link', { name: '開始使用' }).click();
  await page.getByLabel('你的姓名').fill('測試 User');
  await page.getByLabel('電子郵件').fill('example@example.com');
  await page.getByLabel('密碼', { exact: true }).fill('short');
  await page.getByRole('button', { name: '建立帳號', exact: true }).click();
  await expect(page.getByText('請使用至少 12 個字元')).toBeVisible();
  await page
    .getByRole('combobox', { name: 'Language / 語言' })
    .selectOption('en');
  await expect(page.getByLabel('Your name')).toHaveValue('測試 User');
  await expect(page.getByText('Use at least 12 characters')).toBeVisible();
  await page
    .getByRole('combobox', { name: 'Language / 語言' })
    .selectOption('zh-TW');
  await page.reload();
  await expect(
    page.getByRole('heading', { name: '為好點子留個空間。' }),
  ).toBeVisible();
  await page.goto('/');
  await page.getByRole('button', { name: '以 Alice 體驗' }).click();
  const status = page.getByRole('status', { name: '連線狀態' });
  await expect(status).toHaveText('已連線');
  await expect(
    page.getByRole('heading', { name: 'Website Launch', exact: true }),
  ).toBeVisible();
  await page.getByLabel('在 Backlog 新增卡片').fill('保留這份草稿 unchanged');
  let sockets = 0;
  page.on('websocket', () => sockets++);
  await page
    .getByRole('combobox', { name: 'Language / 語言' })
    .selectOption('en');
  await expect(page.getByLabel('New card in Backlog')).toHaveValue(
    '保留這份草稿 unchanged',
  );
  await expect(
    page.getByRole('status', { name: 'Connection status' }),
  ).toHaveText('Connected');
  await page
    .getByRole('combobox', { name: 'Language / 語言' })
    .selectOption('zh-TW');
  await page.getByRole('button', { name: '活動紀錄', exact: true }).click();
  await expect(page.getByRole('heading', { name: '最近的活動' })).toBeVisible();
  expect(sockets).toBe(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: 'docs/screenshots/board-zh.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.goto('/workspaces');
  await expect(page.getByText('你的工作區', { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test('saved locale renders on the server and invalid cookies fall back to English', async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  await context.addCookies([
    { name: 'collabedge_locale', value: 'zh-TW', url: 'http://localhost:3000' },
  ]);
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-TW');
  await expect(page.getByRole('link', { name: '開始使用' })).toBeVisible();
  await context.addCookies([
    {
      name: 'collabedge_locale',
      value: 'unsupported',
      url: 'http://localhost:3000',
    },
  ]);
  await page.goto('/login');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(
    page.getByRole('heading', { name: 'Welcome back.' }),
  ).toBeVisible();
  await context.close();
});
