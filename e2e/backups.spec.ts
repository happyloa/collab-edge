import { test, expect } from './fixture';
import type { Snapshot } from '../src/realtime/protocol';
import { createBoardBackup } from '../src/backups/format';

test('owners preview backups, resume committed uploads after reload and retry final receipts without duplicate boards', async ({
  page,
}) => {
  await page.goto('/register');
  await page.getByLabel('Your name').fill('Backup owner');
  await page
    .getByLabel('Email address')
    .fill(`backup-${crypto.randomUUID()}@example.com`);
  await page
    .getByLabel('Password', { exact: true })
    .fill('A-backup-test-password-2026');
  await page
    .getByRole('button', { name: 'Create account', exact: true })
    .click();
  await expect(page).toHaveURL(/\/workspaces$/);
  await page
    .getByLabel('New workspace', { exact: true })
    .fill('Backup workspace');
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await expect(
    page.getByRole('heading', { name: 'Backup workspace' }),
  ).toBeVisible();
  const before = await page.request.get('/api/workspaces');
  const workspaceId = (
    (await before.json()) as { id: string; name: string }[]
  ).find((workspace) => workspace.name === 'Backup workspace')!.id;
  const boardId = crypto.randomUUID(),
    columnId = crypto.randomUUID(),
    cardId = crypto.randomUUID(),
    formerUser = crypto.randomUUID();
  const snapshot: Snapshot = {
    board: {
      id: boardId,
      workspaceId: crypto.randomUUID(),
      name: 'Recovered history',
      revision: 7,
      nameRevision: 1,
      archived: false,
    },
    columns: [
      {
        id: columnId,
        boardId,
        title: 'Imported column',
        position: 900,
        updatedRevision: 1,
        titleRevision: 1,
      },
    ],
    cards: [
      {
        id: cardId,
        boardId,
        columnId,
        title: 'Imported task',
        description: '保留原始內容',
        position: 999,
        archived: false,
        updatedRevision: 1,
        titleRevision: 1,
        descriptionRevision: 1,
        assigneeId: formerUser,
        dueDate: '2026-10-20',
        assigneeRevision: 1,
        dueDateRevision: 1,
      },
    ],
    comments: Array.from({ length: 40 }, (_, index) => ({
      id: crypto.randomUUID(),
      boardId,
      cardId,
      actorId: formerUser,
      body: `Original comment ${index}`,
      createdAt: '2026-09-28T01:02:03.000Z',
    })),
    attachments: [
      {
        id: crypto.randomUUID(),
        boardId,
        cardId,
        actorId: formerUser,
        filename: 'historical-notes.txt',
        mime: 'text/plain',
        size: 128,
        createdAt: '2026-09-28T01:02:03.000Z',
      },
    ],
  };
  const valid = await createBoardBackup(snapshot, [
    { id: formerUser, name: 'Previous author' },
  ]);
  const damaged = structuredClone(valid);
  damaged.snapshot.board.name = 'Changed after export';
  const upload = (name: string, value: unknown) => ({
    name,
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(value)),
  });
  await page.getByRole('button', { name: 'Restore a board backup' }).click();
  await expect(page.getByLabel('Board backup file')).toBeEnabled();
  await page
    .getByLabel('Board backup file')
    .setInputFiles(upload('damaged.json', damaged));
  await expect(page.getByRole('alert')).toContainText(
    'Backup is invalid, damaged or exceeds board limits.',
  );
  expect(
    (
      (await (
        await page.request.get(`/api/workspaces/${workspaceId}`)
      ).json()) as { boards: unknown[] }
    ).boards,
  ).toHaveLength(0);
  // Exercise legacy exports as well as the v2 checksum above.
  const legacy = {
    format: 'collabedge.board.v1',
    exportedAt: valid.exportedAt,
    snapshot,
    people: valid.people,
    attachmentContentsIncluded: false,
  };
  const file = upload('legacy.json', legacy);
  await page.getByLabel('Board backup file').setInputFiles(file);
  await expect(
    page.getByText(
      'Legacy backup: no checksum is available. Restore only files you trust.',
    ),
  ).toBeVisible();
  await page
    .getByLabel('Assign imported tasks from Previous author')
    .selectOption({ label: 'Backup owner' });
  await page
    .getByRole('checkbox', {
      name: 'I understand this creates a new board and uses the workspace capacity.',
    })
    .check();
  let lostUpload = false,
    lostCompletion = false,
    newJobs = 0;
  page.on('request', (request) => {
    if (
      request.method() === 'POST' &&
      new URL(request.url()).pathname.endsWith('/restores')
    )
      newJobs++;
  });
  const pattern = '**/api/restore-jobs/*';
  await page.route(pattern, async (route) => {
    const request = route.request();
    if (
      (!lostUpload && request.method() === 'PATCH') ||
      (!lostCompletion &&
        request.method() === 'POST' &&
        request.postDataJSON().action === 'complete')
    ) {
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      if (request.method() === 'PATCH') lostUpload = true;
      else lostCompletion = true;
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          error:
            'The service is temporarily unavailable. Please try again later.',
        }),
      });
    } else await route.continue();
  });
  await page.getByRole('button', { name: 'Restore as new board' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  expect(lostUpload).toBe(true);
  expect(
    (
      (await (
        await page.request.get(`/api/workspaces/${workspaceId}`)
      ).json()) as { boards: unknown[] }
    ).boards,
  ).toHaveLength(0);
  await page.reload();
  await page.getByRole('button', { name: 'Restore a board backup' }).click();
  await expect(page.getByText('Uploaded 30 of 43 records.')).toBeVisible();
  await page.getByLabel('Board backup file').setInputFiles(file);
  await expect(
    page.getByRole('button', { name: 'Resume restore' }),
  ).toBeDisabled();
  await page
    .getByRole('checkbox', {
      name: 'I understand this creates a new board and uses the workspace capacity.',
    })
    .check();
  await page.getByRole('button', { name: 'Resume restore' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  expect(lostCompletion).toBe(true);
  const completed = (await (
    await page.request.get(`/api/workspaces/${workspaceId}`)
  ).json()) as { boards: { id: string }[] };
  expect(completed.boards).toHaveLength(1);
  await page.getByRole('button', { name: 'Resume restore' }).click();
  await expect(
    page.getByRole('link', { name: 'Open restored board' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Clean up temporary backup data' }),
  ).toHaveCount(0);
  expect(newJobs).toBe(1);
  expect(
    (
      (await (
        await page.request.get(`/api/workspaces/${workspaceId}`)
      ).json()) as { boards: unknown[] }
    ).boards,
  ).toHaveLength(1);
  await page.getByRole('link', { name: 'Open restored board' }).click();
  await expect(
    page.getByRole('status', { name: 'Connection status' }),
  ).toHaveText('Connected');
  await page
    .getByRole('button', { name: 'Imported task', exact: true })
    .click();
  await expect(page.getByLabel('Description', { exact: true })).toHaveValue(
    '保留原始內容',
  );
  await expect(page.getByLabel('Assignee', { exact: true })).toContainText(
    'Backup owner',
  );
  await expect(
    page.getByText('Original comment 39', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Imported author: Previous author (unverified)', {
      exact: true,
    }),
  ).toHaveCount(40);
  await expect(
    page.getByText('historical-notes.txt', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'historical-notes.txt' }),
  ).toHaveCount(0);
  await page.getByLabel('Language / 語言').selectOption('zh-TW');
  await expect(
    page.getByText('128 位元組 · 檔案無法取得', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('匯入作者：Previous author（身分未驗證）', { exact: true }),
  ).toHaveCount(40);
});

test('owners cancel uploads and release staging before starting a new restore', async ({
  page,
}) => {
  await page.goto('/register');
  await page.getByLabel('Your name').fill('Cancel owner');
  await page
    .getByLabel('Email address')
    .fill(`cancel-backup-${crypto.randomUUID()}@example.com`);
  await page
    .getByLabel('Password', { exact: true })
    .fill('A-backup-test-password-2026');
  await page
    .getByRole('button', { name: 'Create account', exact: true })
    .click();
  await expect(page).toHaveURL(/\/workspaces$/);
  await page
    .getByLabel('New workspace', { exact: true })
    .fill('Cancel workspace');
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await expect(
    page.getByRole('heading', { name: 'Cancel workspace' }),
  ).toBeVisible();
  const id = crypto.randomUUID();
  const backup = await createBoardBackup(
    {
      board: {
        id,
        workspaceId: crypto.randomUUID(),
        name: 'Empty restored board',
        revision: 0,
        nameRevision: 0,
        archived: false,
      },
      columns: [],
      cards: [],
      comments: [],
      attachments: [],
    },
    [],
  );
  await page.getByRole('button', { name: 'Restore a board backup' }).click();
  await expect(page.getByLabel('Board backup file')).toBeEnabled();
  await page.getByLabel('Board backup file').setInputFiles({
    name: 'empty.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await page
    .getByRole('checkbox', {
      name: 'I understand this creates a new board and uses the workspace capacity.',
    })
    .check();
  const pattern = '**/api/restore-jobs/*';
  await page.route(pattern, (route) =>
    route.request().method() === 'POST' &&
    route.request().postDataJSON().action === 'complete'
      ? route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Request failed' }),
        })
      : route.continue(),
  );
  await page.getByRole('button', { name: 'Restore as new board' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel pending restore' }).click();
  await expect(
    page.getByRole('button', { name: 'Cancel pending restore' }),
  ).toHaveCount(0);
  await page.unroute(pattern);
  await expect(
    page.getByRole('checkbox', {
      name: 'I understand this creates a new board and uses the workspace capacity.',
    }),
  ).toBeEnabled();
  await expect(
    page.getByRole('checkbox', {
      name: 'I understand this creates a new board and uses the workspace capacity.',
    }),
  ).not.toBeChecked();
  await page
    .getByRole('checkbox', {
      name: 'I understand this creates a new board and uses the workspace capacity.',
    })
    .check();
  await page.getByRole('button', { name: 'Restore as new board' }).click();
  await expect(
    page.getByRole('link', { name: 'Open restored board' }),
  ).toBeVisible();
});
