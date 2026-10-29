import { test, expect } from './fixture';

test('board access comes before management and remains usable on narrow screens', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/register');
  await page.getByLabel('Your name').fill('Layout tester');
  await page
    .getByLabel('Email address')
    .fill(`layout-${crypto.randomUUID()}@example.com`);
  await page
    .getByLabel('Password', { exact: true })
    .fill('A-layout-test-password-2026');
  await page
    .getByRole('button', { name: 'Create account', exact: true })
    .click();
  await page
    .getByLabel('New workspace', { exact: true })
    .fill('Layout workspace');
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await expect(
    page.getByText('No boards here yet. Create one to get started.'),
  ).toBeVisible();
  await page.getByLabel('New board', { exact: true }).fill('First board');
  await page.getByRole('button', { name: 'Create board' }).click();
  const board = page.getByRole('link', { name: /First board/ });
  await expect(board).toBeVisible();
  const boardY = (await board.boundingBox())!.y;
  const managementY = (await page
    .getByText('Workspace management', { exact: true })
    .boundingBox())!.y;
  expect(boardY).toBeLessThan(managementY);
  const accountRemoval = page.getByRole('button', {
    name: 'Delete my account',
  });
  await expect(accountRemoval).toBeVisible();
  expect(boardY).toBeLessThan((await accountRemoval.boundingBox())!.y);
  const invitation = page.getByLabel('Invite a registered teammate');
  await invitation.fill('saved@example.com');
  await page.getByText('Workspace management', { exact: true }).click();
  await expect(invitation).toBeHidden();
  await page.getByText('Workspace management', { exact: true }).click();
  await expect(invitation).toHaveValue('saved@example.com');
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(320);
  await page
    .getByRole('combobox', { name: 'Language / 語言' })
    .selectOption('zh-TW');
  await expect(page.getByRole('heading', { name: '你的看板' })).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(320);
});
