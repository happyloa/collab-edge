import { test, expect } from './fixture';
import { DEMO } from '../src/db/demo';

test('session state keeps guests and signed-in users on the right pages', async ({
  page,
}) => {
  const email = `navigation-${crypto.randomUUID()}@example.com`;
  const password = 'A-navigation-password-2026';

  await page.goto('/workspaces');
  await expect(page).toHaveURL(/\/login\?/);
  expect(new URL(page.url()).searchParams.get('next')).toBe('/workspaces');

  await page.goto(`/boards/${DEMO.board}`);
  await expect(page).toHaveURL(/\/login\?/);
  expect(new URL(page.url()).searchParams.get('next')).toBe(
    `/boards/${DEMO.board}`,
  );

  await page.goto('/register');
  await page.getByLabel('Your name').fill('Navigation Tester');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/workspaces$/);
  await expect(page.getByText(email, { exact: true })).toBeVisible();

  await page.goto('/login');
  await expect(page).toHaveURL(/\/workspaces$/);
  await page.goto('/register');
  await expect(page).toHaveURL(/\/workspaces$/);
  await page.goto('/reset-password');
  await expect(
    page.getByRole('heading', { name: 'Reset your password' }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Back to workspaces' }),
  ).toBeVisible();

  await page.goto('/');
  await expect(
    page.locator('header').getByRole('link', { name: 'Open workspace' }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sign in' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Try as Alice' })).toHaveCount(
    0,
  );

  await page.goto('/workspaces');
  await page
    .getByLabel('New workspace', { exact: true })
    .fill('Navigation Team');
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await page.getByLabel('New board').fill('Return Board');
  await page.getByRole('button', { name: 'Create board' }).click();
  const boardHref = await page
    .locator('a[href^="/boards/"]')
    .filter({ hasText: 'Return Board' })
    .getAttribute('href');
  expect(boardHref).toMatch(/^\/boards\/[0-9a-f-]{36}$/);

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto(boardHref!);
  await expect(page).toHaveURL(/\/login\?/);
  expect(new URL(page.url()).searchParams.get('next')).toBe(boardHref);
  await page.getByRole('link', { name: 'Create an account' }).click();
  await expect(page).toHaveURL(/\/register\?/);
  expect(new URL(page.url()).searchParams.get('next')).toBe(boardHref);
  await page.getByRole('link', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/login\?/);
  expect(new URL(page.url()).searchParams.get('next')).toBe(boardHref);
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${boardHref}$`));
  await expect(
    page.getByRole('heading', { name: 'Return Board' }),
  ).toBeVisible();

  await page.goto('/workspaces');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/login?next=https%3A%2F%2Fevil.example');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/workspaces$/);
});
