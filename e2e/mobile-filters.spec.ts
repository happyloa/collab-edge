import { test, expect } from './fixture';

test('mobile filters remain discoverable and retain their state when collapsed', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Try as Alice' }).click();
  await expect(
    page.getByRole('status', { name: 'Connection status' }),
  ).toHaveText('Connected');
  const toggle = page.getByRole('button', { name: 'Filters', exact: true });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByLabel('Filter by assignee')).toBeHidden();
  await toggle.click();
  await page
    .getByLabel('Filter by assignee')
    .selectOption({ label: 'Unassigned' });
  await expect(
    page.getByText('1 active filter(s).', { exact: false }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Filters (1)' }).click();
  await expect(page.getByLabel('Filter by assignee')).toBeHidden();
  await page.getByRole('button', { name: 'Filters (1)' }).click();
  await expect(page.getByLabel('Filter by assignee')).toHaveValue('unassigned');
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(
    page.getByRole('button', { name: 'Filters', exact: true }),
  ).toHaveAttribute('aria-expanded', 'true');
  await expect(
    page.getByRole('region', { name: 'Board columns' }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});
