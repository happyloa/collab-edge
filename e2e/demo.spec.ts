import { test, expect } from '@playwright/test';
test('public demo supports keyboard entry, mobile layout, and dark theme', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: /Good work happens/ }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Try as Alice' }),
  ).toBeEnabled();
  await page.getByRole('button', { name: 'Try as Alice' }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/boards\//);
  await expect(
    page.getByRole('status', { name: 'Connection status' }),
  ).toHaveText('Connected');
  await expect(
    page.getByRole('heading', { name: 'Website Launch' }),
  ).toBeVisible();
  await page.screenshot({
    path: 'docs/screenshots/demo-board.png',
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Toggle color theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole('heading', { name: 'Website Launch' }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: 'docs/screenshots/mobile-dark.png',
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
