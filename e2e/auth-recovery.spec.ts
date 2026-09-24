import { test, expect } from '@playwright/test';

test('recovery is reachable from login and validates both passwords', async ({
  page,
}) => {
  await page.goto('/login');
  await page.getByRole('link', { name: 'Forgot password?' }).click();
  await expect(page).toHaveURL(/\/reset-password$/);
  await expect(
    page.getByRole('heading', { name: 'Reset your password' }),
  ).toBeVisible();
  await page
    .getByLabel('New password', { exact: true })
    .fill('A-long-new-password-2026');
  await page
    .getByLabel('Confirm new password')
    .fill('A-different-password-2026');
  await page.getByRole('button', { name: 'Set new password' }).click();
  await expect(page.getByRole('alert')).toHaveText('Passwords do not match');

  await page.getByRole('combobox').selectOption('zh-TW');
  await expect(page.getByRole('heading', { name: '重設密碼' })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveText('兩次輸入的密碼不相同');
  await page.getByRole('link', { name: '返回登入' }).click();
  await expect(page).toHaveURL(/\/login$/);
});
