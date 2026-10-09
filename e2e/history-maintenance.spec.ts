import { test, expect } from './fixture';

test('history maintenance stays owner-only, loads on demand and uses the server preview on a new board', async ({
  page,
}) => {
  await page.goto('/register');
  await page.getByLabel('Your name').fill('History owner');
  await page
    .getByLabel('Email address')
    .fill(`history-${crypto.randomUUID()}@example.com`);
  await page
    .getByLabel('Password', { exact: true })
    .fill('A-history-test-password-2026');
  await page
    .getByRole('button', { name: 'Create account', exact: true })
    .click();
  await expect(page).toHaveURL(/\/workspaces$/);
  await page
    .getByLabel('New workspace', { exact: true })
    .fill('History workspace');
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await expect(
    page.getByRole('heading', { name: 'History workspace' }),
  ).toBeVisible();
  await page.getByLabel('New board').fill('History board');
  await page.getByRole('button', { name: 'Create board' }).click();
  await page.getByRole('link', { name: /History board/ }).click();
  await expect(
    page.getByRole('status', { name: 'Connection status' }),
  ).toHaveText('Connected');
  const requests: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.endsWith('/retention'))
      requests.push(request.method());
  });
  await page.getByRole('button', { name: 'Activity', exact: true }).click();
  expect(requests).toEqual([]);
  await page.getByRole('button', { name: 'Manage history' }).click();
  const panel = page.getByRole('region', { name: 'History maintenance' });
  await expect(
    panel.getByText('No event details are eligible for clearing.'),
  ).toBeVisible();
  expect(requests).toEqual(['GET']);
  await expect(panel.getByRole('checkbox')).toHaveCount(0);
  await expect(
    panel.getByRole('button', { name: 'Clear reviewed batch' }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Manage history' }).click();
  await page.getByRole('button', { name: 'Manage history' }).click();
  await expect(
    panel.getByText('No event details are eligible for clearing.'),
  ).toBeVisible();
  expect(requests).toEqual(['GET']);
  await page
    .getByRole('combobox', { name: 'Language / 語言' })
    .selectOption('zh-TW');
  await expect(
    page.getByRole('region', { name: '歷史紀錄維護' }),
  ).toContainText('目前沒有符合條件的事件內容。');
  await page.getByRole('button', { name: '重新讀取清理預覽' }).click();
  await expect.poll(() => requests).toEqual(['GET', 'GET']);
  // Demo identities remain editors, and the shared demo cannot be compacted.
  await page
    .getByRole('banner')
    .getByRole('link', { name: 'CollabEdge' })
    .click();
  await expect(page).toHaveURL(/\/workspaces$/);
  await page.getByRole('button', { name: '登出' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/');
  await page.getByRole('button', { name: '以 Alice 體驗' }).click();
  await expect(page.getByRole('status', { name: '連線狀態' })).toHaveText(
    '已連線',
  );
  await page.getByRole('button', { name: '活動紀錄', exact: true }).click();
  await expect(page.getByRole('button', { name: '管理歷史紀錄' })).toHaveCount(
    0,
  );
  const boardId = new URL(page.url()).pathname.split('/').at(-1);
  expect(
    (await page.request.get(`/api/boards/${boardId}/retention`)).status(),
  ).toBe(403);
});
