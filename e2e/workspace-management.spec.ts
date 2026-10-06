import { test, expect } from './fixture';

test('workspace forms serialize submissions, retain failed inputs and reset context-bound drafts', async ({
  page,
}) => {
  const duplicateKeys: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && message.text().includes('same key'))
      duplicateKeys.push(message.text());
  });
  await page.goto('/register');
  await page.getByLabel('Your name').fill('Workspace tester');
  await page
    .getByLabel('Email address')
    .fill(`workspace-${crypto.randomUUID()}@example.com`);
  await page
    .getByLabel('Password', { exact: true })
    .fill('A-workspace-test-password-2026');
  await page
    .getByRole('button', { name: 'Create account', exact: true })
    .click();
  await expect(page).toHaveURL(/\/workspaces$/);
  let requests = 0;
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/workspaces', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    requests++;
    await held;
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        error: 'Service temporarily unavailable',
        code: 'SERVICE_UNAVAILABLE',
      }),
    });
  });
  const name = page.getByLabel('New workspace', { exact: true });
  await name.fill('Workspace A');
  const create = page.getByRole('button', {
    name: 'Create workspace',
    exact: true,
  });
  await create.click();
  await expect(create).toBeDisabled();
  await create.evaluate((button) => {
    (button as HTMLButtonElement).form!.dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    );
  });
  await expect.poll(() => requests).toBe(1);
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeDisabled();
  release();
  await expect(page.getByRole('alert')).toContainText(
    'Service temporarily unavailable',
  );
  await expect(name).toHaveValue('Workspace A');
  await expect(create).toBeEnabled();
  await page.unroute('**/api/workspaces');
  await create.click();
  await expect(
    page.getByRole('heading', { name: 'Workspace A', exact: true }),
  ).toBeVisible();
  await name.fill('Workspace B');
  await create.click();
  await expect(
    page.getByRole('heading', { name: 'Workspace B', exact: true }),
  ).toBeVisible();
  await page
    .getByLabel('Invite a registered teammate')
    .fill('draft-invitation@example.com');
  await page
    .getByLabel('New board', { exact: true })
    .fill('A context-specific board');
  await page.getByRole('button', { name: 'Workspace A', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Workspace A', exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel('Invite a registered teammate')).toHaveValue('');
  await expect(page.getByLabel('New board', { exact: true })).toHaveValue('');
  await page.getByLabel('Show archived boards').check();
  await page.getByLabel('New board', { exact: true }).fill('New active board');
  await page.getByRole('button', { name: 'Create board', exact: true }).click();
  await expect(page.getByLabel('Show archived boards')).not.toBeChecked();
  await expect(
    page.getByRole('link', { name: /New active board/ }),
  ).toBeVisible();
  expect(duplicateKeys).toEqual([]);
});
