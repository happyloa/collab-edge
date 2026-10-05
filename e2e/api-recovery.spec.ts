import { test, expect } from './fixture';
import type { Snapshot } from '../src/realtime/protocol';

test('registration keeps inputs after a non-JSON failure and retries only on submission', async ({
  page,
}) => {
  await page.goto('/register');
  const email = `gateway-${crypto.randomUUID()}@example.com`;
  await page.getByLabel('Your name').fill('Gateway Tester');
  await page.getByLabel('Email address').fill(email);
  await page
    .getByLabel('Password', { exact: true })
    .fill('A-gateway-password-2026');
  let calls = 0;
  await page.route('**/api/auth/register', async (route) => {
    calls++;
    if (calls === 1)
      await route.fulfill({
        status: 503,
        contentType: 'text/html',
        body: '<html>Internal gateway details</html>',
      });
    else await route.continue();
  });
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('alert')).toContainText(
    'The service is temporarily unavailable',
  );
  await expect(page.getByLabel('Your name')).toHaveValue('Gateway Tester');
  await expect(page.getByLabel('Email address')).toHaveValue(email);
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue(
    'A-gateway-password-2026',
  );
  expect(calls).toBe(1);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/workspaces$/);
  expect(calls).toBe(2);
});

test('a board draft survives session expiry and sign-in in another tab', async ({
  page,
  context,
}) => {
  const email = `recovery-${crypto.randomUUID()}@example.com`;
  const password = 'A-recovery-password-2026';
  await page.goto('/register');
  await page.getByLabel('Your name').fill('Recovery Tester');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/workspaces$/);
  await page.getByLabel('New workspace', { exact: true }).fill('Recovery Team');
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await page.getByLabel('New board').fill('Recovery Board');
  await page.getByRole('button', { name: 'Create board' }).click();
  await page.getByRole('link', { name: /Recovery Board/ }).click();
  await expect(
    page.getByRole('status', { name: 'Connection status' }),
  ).toHaveText('Connected');
  await page.getByLabel('New card in Backlog').fill('Recovery Card');
  await page
    .getByRole('region', { name: 'Backlog', exact: true })
    .getByRole('button', { name: 'Add card' })
    .click();
  await page
    .getByRole('button', { name: 'Recovery Card', exact: true })
    .click();
  await page
    .getByRole('textbox', { name: 'Description', exact: true })
    .fill('An unsaved description stays here');
  const boardUrl = page.url();
  const logout = await context.request.post(
    new URL('/api/auth/logout', boardUrl).href,
    { headers: { Origin: new URL(boardUrl).origin }, data: {} },
  );
  expect(logout.ok()).toBe(true);
  const file = {
    name: 'recovery.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Recovered upload'),
  };
  await page.getByLabel('Upload a file').setInputFiles(file);
  await expect(page.getByRole('alert')).toContainText('Please sign in');
  const popupPromise = page.waitForEvent('popup');
  await page
    .getByRole('link', { name: 'Sign in in another tab', exact: true })
    .click();
  const popup = await popupPromise;
  await popup.getByLabel('Email address').fill(email);
  await popup.getByLabel('Password', { exact: true }).fill(password);
  await popup.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(popup).toHaveURL(/\/workspaces$/);
  await popup.close();
  await expect(page).toHaveURL(boardUrl);
  await expect(
    page.getByRole('textbox', { name: 'Description', exact: true }),
  ).toHaveValue('An unsaved description stays here');
  const reconnected = page.waitForEvent('websocket');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Reconnect board' })
    .click();
  await reconnected;
  await page.getByLabel('Upload a file').setInputFiles(file);
  await expect(
    page.getByRole('link', { name: 'recovery.txt', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('textbox', { name: 'Description', exact: true }),
  ).toHaveValue('An unsaved description stays here');
});

test('reconnecting under another account preserves the draft without submitting it', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try as Alice' }).click();
  await expect(
    page.getByRole('status', { name: 'Connection status' }),
  ).toHaveText('Connected');
  const boardUrl = page.url();
  const boardId = new URL(boardUrl).pathname.split('/').at(-1)!;
  const initial = (await (
    await context.request.get(new URL(`/api/boards/${boardId}`, boardUrl).href)
  ).json()) as { snapshot: Snapshot };
  const card = initial.snapshot.cards[0];
  await page.getByRole('button', { name: card.title, exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Description', exact: true })
    .fill('A private Alice draft');
  const switched = await context.request.post(
    new URL('/api/auth/demo', boardUrl).href,
    { headers: { Origin: new URL(boardUrl).origin }, data: { person: 'Bob' } },
  );
  expect(switched.ok()).toBe(true);
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Reconnect board' })
    .click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText(
    'Sign in to the original account to recover this draft.',
  );
  await expect(
    page.getByRole('textbox', { name: 'Description', exact: true }),
  ).toHaveValue('A private Alice draft');
  const current = (await (
    await context.request.get(new URL(`/api/boards/${boardId}`, boardUrl).href)
  ).json()) as { snapshot: Snapshot };
  expect(
    current.snapshot.cards.find((item) => item.id === card.id)?.description,
  ).toBe(card.description);
});
