import { test, expect } from './fixture';
import type { Page } from '@playwright/test';
import type { Snapshot, BoardEvent } from '../src/realtime/protocol';
import type { DraftLease } from '../src/drafts/store';

async function openDemo(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try as Alice' }).click();
  await expect(
    page.getByRole('status', { name: 'Connection status' }),
  ).toHaveText('Connected');
  const boardId = new URL(page.url()).pathname.split('/').at(-1)!;
  const result = await page.request.get(`/api/boards/${boardId}`);
  const data = (await result.json()) as {
    snapshot: Snapshot;
    user: { id: string };
  };
  const card = data.snapshot.cards.find((item) => !item.archived)!;
  return { ...data, card, boardId };
}
async function drafts(page: Page) {
  return page.evaluate(async () => {
    const request = indexedDB.open('collabedge-drafts', 1);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction('drafts');
    const read = tx.objectStore('drafts').getAll();
    const result = await new Promise<unknown[]>((resolve, reject) => {
      read.onsuccess = () => resolve(read.result);
      read.onerror = () => reject(read.error);
    });
    db.close();
    return result;
  });
}

test('offline fields and comments survive reload, close confirmation and deliberate review', async ({
  page,
  context,
}) => {
  const { card, boardId } = await openDemo(page);
  const boardUrl = page.url();
  await page.getByRole('button', { name: card.title, exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await context.setOffline(true);
  const description = `Offline draft ${crypto.randomUUID()}`;
  const comment = `Unsent comment ${crypto.randomUUID()}`;
  await page.getByLabel('Description', { exact: true }).fill(description);
  await page.getByLabel('Add a comment', { exact: true }).fill(comment);
  await expect(page.getByRole('status', { name: 'Draft status' })).toHaveText(
    'Draft saved on this device.',
  );
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('button', { name: 'Continue editing' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Keep draft and close' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(
    page.getByRole('button', { name: card.title, exact: true }),
  ).toBeFocused();
  await context.setOffline(false);
  await page.reload();
  await expect(
    page.getByRole('button', {
      name: `Review draft for ${card.title}`,
      exact: true,
    }),
  ).toBeVisible();
  const before = (await (
    await page.request.get(`/api/boards/${boardId}`)
  ).json()) as { snapshot: Snapshot };
  expect(
    before.snapshot.cards.find((item) => item.id === card.id)?.description,
  ).toBe(card.description);
  expect(before.snapshot.comments.some((item) => item.body === comment)).toBe(
    false,
  );
  await page
    .getByRole('button', {
      name: `Review draft for ${card.title}`,
      exact: true,
    })
    .click();
  await expect(page.getByLabel('Description', { exact: true })).toHaveValue(
    description,
  );
  await expect(page.getByLabel('Add a comment', { exact: true })).toHaveValue(
    comment,
  );
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page
    .getByRole('button', {
      name: `Review draft for ${card.title}`,
      exact: true,
    })
    .click();
  await page.getByRole('button', { name: 'Post comment' }).click();
  await expect(page.getByLabel('Add a comment', { exact: true })).toHaveValue(
    '',
  );
  await page.getByRole('button', { name: 'Close card' }).click();
  await expect.poll(() => drafts(page)).toEqual([]);
  await expect(
    page.getByRole('heading', { name: 'Website Launch', exact: true }),
  ).toBeFocused();
  await page.goto(boardUrl);
  const after = (await (
    await page.request.get(`/api/boards/${boardId}`)
  ).json()) as { snapshot: Snapshot };
  expect(
    after.snapshot.cards.find((item) => item.id === card.id)?.description,
  ).toBe(description);
  expect(
    after.snapshot.comments.filter((item) => item.body === comment),
  ).toHaveLength(1);
});

test('separate tabs keep independent drafts and restored edits retain conflict guards', async ({
  page,
  context,
}) => {
  const { card } = await openDemo(page);
  const other = await context.newPage();
  await other.goto(page.url());
  for (const tab of [page, other])
    await tab.getByRole('button', { name: card.title, exact: true }).click();
  await Promise.all([
    page.getByLabel('Description', { exact: true }).fill('First tab draft'),
    other.getByLabel('Description', { exact: true }).fill('Second tab draft'),
  ]);
  for (const tab of [page, other]) {
    await expect(tab.getByRole('status', { name: 'Draft status' })).toHaveText(
      'Draft saved on this device.',
    );
    await tab.getByRole('button', { name: 'Close card' }).click();
    await tab.getByRole('button', { name: 'Keep draft and close' }).click();
  }
  await expect.poll(async () => (await drafts(page)).length).toBe(2);
  await other
    .getByRole('article')
    .filter({ hasText: 'Second tab draft' })
    .getByRole('button', {
      name: `Review draft for ${card.title}`,
      exact: true,
    })
    .click();
  await other
    .getByLabel('Description', { exact: true })
    .fill('The committed teammate update');
  await other.getByRole('button', { name: 'Save changes' }).click();
  await expect(other.getByRole('dialog')).not.toBeVisible();
  await page.reload();
  await page
    .getByRole('button', {
      name: `Review draft for ${card.title}`,
      exact: true,
    })
    .click();
  await expect(page.getByLabel('Description', { exact: true })).toHaveValue(
    'First tab draft',
  );
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Edit conflict' }),
  ).toContainText('First tab draft');
  await page
    .getByRole('alert')
    .filter({ hasText: 'Edit conflict' })
    .getByRole('button', { name: 'Discard draft', exact: true })
    .click();
  await expect.poll(() => drafts(page)).toEqual([]);
  await other.close();
});

test('a recovered committed mutation keeps its UUID and does not duplicate a comment', async ({
  page,
}) => {
  const { card, boardId, user } = await openDemo(page);
  const body = `Deduplicated comment ${crypto.randomUUID()}`;
  await page.getByRole('button', { name: card.title, exact: true }).click();
  await page.getByLabel('Add a comment', { exact: true }).fill(body);
  await page.getByRole('button', { name: 'Post comment' }).click();
  await expect(
    page.getByRole('dialog').getByText(body, { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Close card' }).click();
  await expect.poll(() => drafts(page)).toEqual([]);
  const snapshot = (await (
    await page.request.get(`/api/boards/${boardId}`)
  ).json()) as { snapshot: Snapshot };
  const comment = snapshot.snapshot.comments.find(
    (item) => item.body === body,
  )!;
  const history = (await (
    await page.request.get(`/api/boards/${boardId}/activity`)
  ).json()) as { events: BoardEvent[] };
  const event = history.events.find((item) =>
    item.payload.comments?.some((entry) => entry.id === comment.id),
  )!;
  await page.evaluate(
    async ({ userId, boardId, cardId, body, commentId, event }) => {
      const path = '/src/drafts/store.ts';
      const store = (await import(
        path
      )) as typeof import('../src/drafts/store');
      const lease = await store.activateDraftOwner(userId, false);
      await store.saveDraft(lease, {
        kind: 'mutation',
        version: 1,
        id: event.clientMutationId,
        ownerId: userId,
        boardId,
        mutation: {
          clientMutationId: event.clientMutationId,
          baseRevision: event.revision - 1,
          command: {
            type: 'comment.create',
            payload: { id: commentId, cardId, body },
          },
        },
        state: 'pending',
        updatedAt: Date.now(),
      });
    },
    {
      userId: user.id,
      boardId,
      cardId: card.id,
      body,
      commentId: comment.id,
      event,
    },
  );
  await page.reload();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Recovered edit' }),
  ).toContainText(body);
  const before = (await (
    await page.request.get(`/api/boards/${boardId}`)
  ).json()) as { snapshot: Snapshot };
  expect(before.snapshot.board.revision).toBe(snapshot.snapshot.board.revision);
  await page.getByRole('button', { name: 'Retry my draft' }).click();
  await expect.poll(() => drafts(page)).toEqual([]);
  const after = (await (
    await page.request.get(`/api/boards/${boardId}`)
  ).json()) as { snapshot: Snapshot };
  expect(
    after.snapshot.comments.filter((item) => item.body === body),
  ).toHaveLength(1);
  expect(after.snapshot.board.revision).toBe(before.snapshot.board.revision);
});

test('storage transactions enforce cross-tab limits, expiry and account generations', async ({
  page,
  context,
}) => {
  const { card, boardId, user } = await openDemo(page);
  const other = await context.newPage();
  await other.goto(page.url());
  const lease = await page.evaluate(async (ownerId) => {
    const path = '/src/drafts/store.ts';
    const store = (await import(path)) as typeof import('../src/drafts/store');
    return store.activateDraftOwner(ownerId, false);
  }, user.id);
  const fill = (tab: Page) =>
    tab.evaluate(
      async ({ lease, boardId, card }) => {
        const path = '/src/drafts/store.ts';
        const store = (await import(
          path
        )) as typeof import('../src/drafts/store');
        const results = await Promise.allSettled(
          Array.from({ length: 16 }, () =>
            store.saveDraft(lease, {
              kind: 'card',
              version: 1,
              id: crypto.randomUUID(),
              ownerId: lease.ownerId,
              boardId,
              cardId: card.id,
              baseRevision: 1,
              original: {
                title: card.title,
                description: '',
                assigneeId: null,
                dueDate: null,
              },
              fields: {
                title: card.title,
                description: 'Bounded draft',
                assigneeId: null,
                dueDate: null,
              },
              comment: '',
              updatedAt: Date.now(),
            }),
          ),
        );
        return results.filter((result) => result.status === 'fulfilled').length;
      },
      { lease, boardId, card },
    );
  const counts = await Promise.all([fill(page), fill(other)]);
  expect(counts.reduce((total, count) => total + count, 0)).toBe(24);
  expect(await drafts(page)).toHaveLength(24);
  const ttlResult = await page.evaluate(
    async ({ lease, boardId }) => {
      const path = '/src/drafts/store.ts';
      const store = (await import(
        path
      )) as typeof import('../src/drafts/store');
      const entries = await store.listDrafts(lease, boardId);
      const request = indexedDB.open(store.DRAFT_DATABASE, 1);
      const db = await new Promise<IDBDatabase>((resolve) => {
        request.onsuccess = () => resolve(request.result);
      });
      await new Promise<void>((resolve) => {
        const tx = db.transaction('drafts', 'readwrite');
        tx.objectStore('drafts').put({
          ...entries[0],
          updatedAt: Date.now() - store.DRAFT_LIMITS.ttlMs,
        });
        tx.objectStore('drafts').put({ ...entries[1], version: 999 });
        tx.oncomplete = () => resolve();
      });
      db.close();
      return (await store.listDrafts(lease, boardId)).length;
    },
    { lease, boardId },
  );
  expect(ttlResult).toBe(22);
  const byteLimit = await page.evaluate(
    async ({ lease, boardId }) => {
      const path = '/src/drafts/store.ts';
      const store = (await import(
        path
      )) as typeof import('../src/drafts/store');
      const entries = await store.listDrafts(lease, boardId);
      const template = entries[0];
      await Promise.all(
        entries.map((entry) => store.removeDraft(lease, entry.id)),
      );
      const results = await Promise.allSettled(
        Array.from({ length: 4 }, () =>
          store.saveDraft(lease, {
            ...template,
            id: crypto.randomUUID(),
            original: { ...template.original, description: '漢'.repeat(10000) },
            fields: { ...template.fields, description: '漢'.repeat(10000) },
            comment: '界'.repeat(2000),
            updatedAt: Date.now(),
          }),
        ),
      );
      return {
        accepted: results.filter((result) => result.status === 'fulfilled')
          .length,
        reasons: results
          .filter((result) => result.status === 'rejected')
          .map((result) => result.reason.reason),
      };
    },
    { lease, boardId },
  );
  expect(byteLimit).toEqual({ accepted: 3, reasons: ['full'] });
  await page.evaluate(async () => {
    const path = '/src/lib/api-client.ts';
    const { api } = (await import(
      path
    )) as typeof import('../src/lib/api-client');
    await api('/api/auth/demo', {
      method: 'POST',
      body: JSON.stringify({ person: 'Bob' }),
    });
  });
  await page.reload();
  await expect.poll(() => drafts(page)).toEqual([]);
  const staleWrite = await other.evaluate(
    async ({ lease, boardId, card }) => {
      const path = '/src/drafts/store.ts';
      const store = (await import(
        path
      )) as typeof import('../src/drafts/store');
      try {
        await store.saveDraft(lease, {
          kind: 'card',
          version: 1,
          id: crypto.randomUUID(),
          ownerId: lease.ownerId,
          boardId,
          cardId: card.id,
          baseRevision: 1,
          original: {
            title: card.title,
            description: '',
            assigneeId: null,
            dueDate: null,
          },
          fields: {
            title: card.title,
            description: 'Former owner must not write',
            assigneeId: null,
            dueDate: null,
          },
          comment: '',
          updatedAt: Date.now(),
        });
        return 'unexpected success';
      } catch (error) {
        return error instanceof store.DraftError
          ? error.reason
          : 'unexpected error';
      }
    },
    { lease: lease as DraftLease, boardId, card },
  );
  expect(staleWrite).toBe('account-changed');
  await expect.poll(() => drafts(page)).toEqual([]);
  await page.getByRole('button', { name: card.title, exact: true }).click();
  await page
    .getByLabel('Description', { exact: true })
    .fill('Remove on explicit sign out');
  await expect(page.getByRole('status', { name: 'Draft status' })).toHaveText(
    'Draft saved on this device.',
  );
  await page.getByRole('button', { name: 'Close card' }).click();
  await page.getByRole('button', { name: 'Keep draft and close' }).click();
  await expect.poll(async () => (await drafts(page)).length).toBe(1);
  await page.goto('/workspaces');
  await expect(
    page
      .getByRole('banner')
      .getByText('demo-bob@collabedge.invalid', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect.poll(() => drafts(page)).toEqual([]);
  const fenced = await other.evaluate(async () => {
    const path = '/src/drafts/store.ts';
    const store = (await import(path)) as typeof import('../src/drafts/store');
    try {
      await store.activateDraftOwner(
        'd4a0b6ba-15a0-42b9-a074-b59ddedac55c',
        false,
      );
      return 'unexpected success';
    } catch (error) {
      return error instanceof store.DraftError
        ? error.reason
        : 'unexpected error';
    }
  });
  expect(fenced).toBe('account-changed');
  await other.close();
});

test('unavailable draft storage keeps inputs and blocks a submission from losing edits', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'indexedDB', {
      configurable: true,
      get() {
        throw new DOMException('Storage disabled', 'SecurityError');
      },
    });
  });
  const { card, boardId } = await openDemo(page);
  await page.getByRole('button', { name: card.title, exact: true }).click();
  await page
    .getByLabel('Description', { exact: true })
    .fill('Keep this in memory');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByLabel('Description', { exact: true })).toHaveValue(
    'Keep this in memory',
  );
  await expect(
    page.getByRole('status', { name: 'Draft status' }),
  ).toContainText('Draft storage is unavailable');
  const result = (await (
    await page.request.get(`/api/boards/${boardId}`)
  ).json()) as { snapshot: Snapshot };
  expect(
    result.snapshot.cards.find((item) => item.id === card.id)?.description,
  ).toBe(card.description);
  await page.getByRole('button', { name: 'Close card' }).click();
  await page.getByRole('button', { name: 'Keep draft and close' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Discard and close' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
});
