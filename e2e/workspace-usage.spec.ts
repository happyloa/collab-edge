import { test, expect, isolatedContext } from './fixture';
import type { Page } from '@playwright/test';

test('owners inspect scoped capacity, retry explicitly and retain archived usage', async ({
  browser,
}, testInfo) => {
  const ownerContext = await isolatedContext(browser, testInfo);
  const editorContext = await isolatedContext(browser, testInfo);
  const owner = await ownerContext.newPage(),
    editor = await editorContext.newPage();
  const suffix = crypto.randomUUID();
  const ownerEmail = `capacity-owner-${suffix}@example.com`,
    editorEmail = `capacity-editor-${suffix}@example.com`;
  async function register(page: Page, email: string) {
    await page.goto('/register');
    await page.getByLabel('Your name').fill('Capacity tester');
    await page.getByLabel('Email address').fill(email);
    await page
      .getByLabel('Password', { exact: true })
      .fill('A-capacity-test-password-2026');
    await page
      .getByRole('button', { name: 'Create account', exact: true })
      .click();
    await expect(page).toHaveURL(/\/workspaces$/);
  }
  try {
    await register(owner, ownerEmail);
    await register(editor, editorEmail);
    let requests = 0;
    owner.on('request', (request) => {
      if (new URL(request.url()).pathname.endsWith('/usage')) requests++;
    });
    await owner
      .getByLabel('New workspace', { exact: true })
      .fill('Capacity workspace');
    await owner.getByRole('button', { name: 'Create workspace' }).click();
    await expect(
      owner.getByRole('heading', { name: 'Capacity workspace' }),
    ).toBeVisible();
    expect(requests).toBe(0);
    const firstResponse = owner.waitForResponse(
      (response) =>
        new URL(response.url()).pathname.endsWith('/usage') && response.ok(),
    );
    await owner
      .getByRole('button', { name: 'Capacity and limits', exact: true })
      .click();
    const result = await firstResponse;
    const workspaceId = ((await result.json()) as { workspaceId: string })
      .workspaceId;
    const region = owner.getByRole('region', {
      name: 'Capacity and limits',
      exact: true,
    });
    await expect(
      region.getByRole('meter', { name: 'Workspace members' }),
    ).toHaveAttribute('value', '1');
    await expect(
      region.getByRole('meter', { name: 'Workspace boards' }),
    ).toHaveAttribute('value', '0');
    await owner.getByLabel('New board').fill('Capacity board');
    await owner.getByRole('button', { name: 'Create board' }).click();
    await expect(
      region.getByRole('meter', { name: 'Workspace boards' }),
    ).toHaveAttribute('value', '1');
    await expect(
      region.getByRole('heading', { name: 'Capacity board' }),
    ).toBeVisible();
    await owner.getByLabel('Invite a registered teammate').fill(editorEmail);
    await owner.getByRole('button', { name: 'Add member' }).click();
    await expect(
      region.getByRole('meter', { name: 'Workspace members' }),
    ).toHaveAttribute('value', '2');
    await editor.reload();
    await expect(
      editor.getByRole('heading', { name: 'Capacity workspace' }),
    ).toBeVisible();
    await expect(
      editor.getByRole('button', { name: 'Capacity and limits' }),
    ).toHaveCount(0);
    expect(
      (
        await editor.request.get(`/api/workspaces/${workspaceId}/usage`)
      ).status(),
    ).toBe(403);
    const pattern = `**/api/workspaces/${workspaceId}/usage`;
    await owner.route(pattern, (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Service temporarily unavailable' }),
      }),
    );
    await region.getByRole('button', { name: 'Refresh capacity' }).click();
    await expect(region.getByRole('alert')).toBeVisible();
    await expect(
      region.getByRole('heading', { name: 'Capacity board' }),
    ).toHaveCount(0);
    await owner.unroute(pattern);
    await region.getByRole('button', { name: 'Try again' }).click();
    await expect(
      region.getByRole('heading', { name: 'Capacity board' }),
    ).toBeVisible();
    await owner.getByRole('link', { name: /Capacity board/ }).click();
    await expect(
      owner.getByRole('status', { name: 'Connection status' }),
    ).toHaveText('Connected');
    await owner.getByRole('button', { name: 'Board settings' }).click();
    await owner
      .getByRole('button', { name: 'Archive board', exact: true })
      .click();
    await owner.getByRole('button', { name: 'Confirm archive board' }).click();
    await expect(
      owner.getByText(
        'This board is archived. Its history and files remain available read-only.',
      ),
    ).toBeVisible();
    await owner.goto('/workspaces');
    await owner
      .getByRole('button', { name: 'Capacity and limits', exact: true })
      .click();
    await expect(
      region.getByRole('heading', { name: /Capacity board.*Archived/ }),
    ).toBeVisible();
    await expect(
      region.getByRole('meter', { name: 'Workspace boards' }),
    ).toHaveAttribute('value', '1');
    await owner.getByLabel('Language / 語言').selectOption('zh-TW');
    await expect(
      owner.getByRole('region', { name: '容量與使用限制' }),
    ).toContainText('封存會保留資料');
    await expect(
      owner.getByRole('meter', { name: '工作區看板' }),
    ).toHaveAttribute('value', '1');
  } finally {
    await ownerContext.close();
    await editorContext.close();
  }
});
