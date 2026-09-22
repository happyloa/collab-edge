import { test, expect, type Page } from '@playwright/test';
test('two people synchronize, resolve conflicts, reconnect, and share private files', async ({
  browser,
}) => {
  const aliceContext = await browser.newContext();
  const bobContext = await browser.newContext();
  const alice = await aliceContext.newPage();
  const bob = await bobContext.newPage();
  const suffix = crypto.randomUUID().slice(0, 8);
  const email = (name: string) => `${name.toLowerCase()}-${suffix}@example.com`;
  const failures: string[] = [];
  for (const page of [alice, bob])
    page.on('pageerror', (error) => failures.push(error.message));
  async function register(page: Page, name: string) {
    await page.goto('/register');
    await page.getByLabel('Your name').fill(name);
    await page.getByLabel('Email address').fill(email(name));
    await page
      .getByLabel('Password', { exact: true })
      .fill('Portfolio-test-password-2026');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page).toHaveURL(/workspaces/);
  }
  try {
    await register(alice, 'Alice');
    await register(bob, 'Bob');
    await alice
      .getByLabel('New workspace', { exact: true })
      .fill('Acme Product Team');
    await alice
      .getByRole('button', { name: 'Create workspace', exact: true })
      .click();
    await alice.getByLabel('New board', { exact: true }).fill('Website Launch');
    await alice
      .getByRole('button', { name: 'Create board', exact: true })
      .click();
    await alice.getByLabel('Invite a registered teammate').fill(email('Bob'));
    await alice.getByRole('button', { name: 'Add member' }).click();
    await expect(alice.getByText(email('Bob'), { exact: true })).toBeVisible();
    await alice.getByRole('link', { name: /Website Launch/ }).click();
    await expect(alice).toHaveURL(/\/boards\//);
    const boardUrl = alice.url();
    await bob.goto(boardUrl);
    for (const page of [alice, bob])
      await expect(
        page.getByRole('status', { name: 'Connection status' }),
      ).toHaveText('Connected');
    await alice.getByLabel('New card in Backlog').fill('Plan our launch');
    await alice
      .getByRole('region', { name: 'Backlog', exact: true })
      .getByRole('button', { name: 'Add card', exact: true })
      .click();
    await expect(
      bob.getByRole('button', { name: 'Plan our launch', exact: true }),
    ).toBeVisible();
    await alice
      .getByRole('button', { name: 'Plan our launch', exact: true })
      .click();
    await alice
      .getByRole('combobox', { name: 'Move to', exact: true })
      .selectOption({ label: 'In Progress' });
    await alice.getByRole('button', { name: 'Close card' }).click();
    await expect(
      bob
        .getByRole('region', { name: 'In Progress', exact: true })
        .getByRole('button', { name: 'Plan our launch', exact: true }),
    ).toBeVisible();
    await bob
      .getByRole('button', { name: 'Plan our launch', exact: true })
      .click();
    await bob.getByLabel('Title', { exact: true }).fill('Launch checklist');
    await bob.getByRole('button', { name: 'Save changes' }).click();
    await expect(
      alice.getByRole('button', { name: 'Launch checklist', exact: true }),
    ).toBeVisible();
    for (const page of [alice, bob])
      await page
        .getByRole('button', { name: 'Launch checklist', exact: true })
        .click();
    await alice.getByLabel('Title', { exact: true }).fill('Alice proposal');
    await bob.getByLabel('Title', { exact: true }).fill('Bob proposal');
    await bob.getByRole('button', { name: 'Save changes' }).click();
    await expect(
      bob.getByRole('button', { name: 'Bob proposal', exact: true }),
    ).toBeVisible();
    await alice.getByRole('button', { name: 'Save changes' }).click();
    await expect(
      alice.getByRole('alert').filter({ hasText: 'Edit conflict' }),
    ).toContainText('Alice proposal');
    await alice.getByRole('button', { name: 'Retry my draft' }).click();
    await expect(
      bob.getByRole('button', { name: 'Alice proposal', exact: true }),
    ).toBeVisible();
    await bobContext.setOffline(true);
    await expect(
      bob.getByRole('status', { name: 'Connection status' }),
    ).not.toHaveText('Connected', { timeout: 45000 });
    await alice
      .getByRole('button', { name: 'Alice proposal', exact: true })
      .click();
    await alice.getByLabel('Title', { exact: true }).fill('Ready for launch');
    await alice.getByRole('button', { name: 'Save changes' }).click();
    await bobContext.setOffline(false);
    await expect(
      bob.getByRole('status', { name: 'Connection status' }),
    ).toHaveText('Connected', { timeout: 45000 });
    await expect(
      bob.getByRole('button', { name: 'Ready for launch', exact: true }),
    ).toBeVisible();
    await alice
      .getByRole('button', { name: 'Ready for launch', exact: true })
      .click();
    await alice
      .getByLabel('Add a comment', { exact: true })
      .fill('The team is ready.');
    await alice.getByRole('button', { name: 'Post comment' }).click();
    await alice.getByLabel('Upload a file').setInputFiles({
      name: 'launch-notes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Launch notes, shared privately.'),
    });
    await expect(
      alice.getByRole('link', { name: 'launch-notes.txt' }),
    ).toBeVisible();
    await bob
      .getByRole('button', { name: 'Ready for launch', exact: true })
      .click();
    await expect(
      bob.getByText('The team is ready.', { exact: true }),
    ).toBeVisible();
    const download = bob.getByRole('link', { name: 'launch-notes.txt' });
    await expect(download).toBeVisible();
    const fileUrl = await download.getAttribute('href');
    const anonymous = await browser.newContext();
    const denied = await anonymous.request.get(
      new URL(fileUrl!, boardUrl).href,
    );
    expect(denied.status()).toBe(401);
    await anonymous.close();
    await alice.getByRole('button', { name: 'Close card' }).click();
    await alice.screenshot({
      path: 'docs/screenshots/board.png',
      fullPage: true,
    });
    await bob.getByRole('button', { name: 'Close card' }).click();
    await alice.getByRole('button', { name: 'Board settings' }).click();
    await alice
      .getByLabel('Board name', { exact: true })
      .fill('Launch shipped');
    await alice.getByRole('button', { name: 'Save board name' }).click();
    await expect(
      bob.getByRole('heading', { name: 'Launch shipped', exact: true }),
    ).toBeVisible();
    await alice.getByRole('button', { name: 'Board settings' }).click();
    await alice
      .getByRole('button', { name: 'Archive board', exact: true })
      .click();
    await alice.getByRole('button', { name: 'Confirm archive board' }).click();
    for (const page of [alice, bob]) {
      await expect(
        page.getByText('This board is archived.', { exact: false }),
      ).toBeVisible();
      await expect(page.getByLabel('New card in Backlog')).toHaveCount(0);
    }
    await alice.goto('/workspaces');
    await expect(
      alice.getByRole('link', { name: /Launch shipped/ }),
    ).toHaveCount(0);
    expect(failures).toEqual([]);
  } finally {
    await aliceContext.close();
    await bobContext.close();
  }
});
