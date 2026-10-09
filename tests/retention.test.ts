import { env } from 'cloudflare:workers';
import { evictDurableObject } from 'cloudflare:test';
import { beforeEach, expect, it } from 'vitest';
import { GET, POST } from '../app/api/boards/[boardId]/retention/route';
import { GET as ACTIVITY } from '../app/api/boards/[boardId]/activity/route';
import { createSession } from '../src/auth/session';
import { loadSnapshot } from '../src/db/queries/snapshot';
import {
  previewHistory,
  pruneHistory,
  type HistoryRetention,
} from '../src/boards/retention';
import { serverMessage, type ServerMessage } from '../src/realtime/protocol';
import { createBoardBackup } from '../src/backups/format';
import { prepareRestore, restoreChunks } from '../src/backups/transfer';
import {
  startRestore,
  completeRestore,
  cleanRestore,
} from '../src/backups/restore';

beforeEach(async () => {
  await env.DB.prepare('DELETE FROM quotas').run();
  await env.DB.prepare('DELETE FROM board_restore_jobs').run();
});

async function fixture() {
  const owner = crypto.randomUUID(),
    editor = crypto.randomUUID(),
    viewer = crypto.randomUUID(),
    outsider = crypto.randomUUID();
  const workspaceId = crypto.randomUUID(),
    boardId = crypto.randomUUID(),
    columnId = crypto.randomUUID(),
    cardId = crypto.randomUUID();
  const mutationId = crypto.randomUUID();
  const old = new Date(Date.now() - 31 * 86400000).toISOString();
  await env.DB.batch([
    ...[owner, editor, viewer, outsider].map((id) =>
      env.DB.prepare(
        'INSERT INTO users(id,email,name,password,created_at) VALUES(?,?,?,?,?)',
      ).bind(
        id,
        `${id}@retention.test`,
        'History tester',
        'unused',
        Date.now(),
      ),
    ),
    env.DB.prepare('INSERT INTO workspaces VALUES(?,?,?)').bind(
      workspaceId,
      'Retention workspace',
      owner,
    ),
    ...[
      [owner, 'OWNER'],
      [editor, 'EDITOR'],
      [viewer, 'VIEWER'],
    ].map(([id, role]) =>
      env.DB.prepare('INSERT INTO workspace_members VALUES(?,?,?)').bind(
        workspaceId,
        id,
        role,
      ),
    ),
    env.DB.prepare(
      'INSERT INTO boards(id,workspace_id,name,revision,name_revision) VALUES(?,?,?,?,?)',
    ).bind(boardId, workspaceId, 'Current board', 360, 360),
    env.DB.prepare('INSERT INTO board_columns VALUES(?,?,?,?,?,?)').bind(
      columnId,
      boardId,
      'Keep this column',
      0,
      1,
      1,
    ),
    env.DB.prepare(
      'INSERT INTO cards(id,board_id,column_id,title,description,position,updated_revision,title_revision,description_revision,assignee_id,due_date) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
    ).bind(
      cardId,
      boardId,
      columnId,
      'Keep this task',
      '原始內容 still available',
      0,
      1,
      1,
      1,
      editor,
      '2026-12-01',
    ),
    env.DB.prepare(
      'INSERT INTO card_comments(id,board_id,card_id,actor_id,body,created_at) VALUES(?,?,?,?,?,?)',
    ).bind(
      crypto.randomUUID(),
      boardId,
      cardId,
      owner,
      'Keep this comment',
      old,
    ),
  ]);
  for (let offset = 0; offset < 360; offset += 100)
    await env.DB.batch(
      Array.from({ length: Math.min(100, 360 - offset) }, (_, i) => {
        const revision = offset + i + 1;
        return env.DB.prepare(
          'INSERT INTO board_events(event_id,board_id,revision,client_mutation_id,actor_id,type,payload,created_at) VALUES(?,?,?,?,?,?,?,?)',
        ).bind(
          crypto.randomUUID(),
          boardId,
          revision,
          revision === 1 ? mutationId : crypto.randomUUID(),
          owner,
          'board.rename',
          JSON.stringify({
            board: {
              name: `Old name ${revision}`,
              nameRevision: revision,
              archived: false,
            },
          }),
          revision === 2 ? new Date().toISOString() : old,
        );
      }),
    );
  const cookies = new Map<string, string>();
  for (const id of [owner, editor, viewer, outsider])
    cookies.set(
      id,
      (await createSession(id, new Request('https://retention.test'))).split(
        ';',
      )[0],
    );
  const request = (
    actor = owner,
    method = 'GET',
    data?: unknown,
    resource = 'retention',
  ) =>
    new Request(`https://retention.test/api/boards/${boardId}/${resource}`, {
      method,
      headers: {
        Cookie: cookies.get(actor) ?? '',
        Origin: 'https://retention.test',
        'Content-Type': 'application/json',
      },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
  const preview = async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    return (await response.json()) as HistoryRetention;
  };
  const input = (data: HistoryRetention) => ({
    boardId,
    expectedRevision: data.revision,
    before: data.before,
    batch: data.batch!,
  });
  async function socket(actor = owner) {
    const response = await env.BOARD_ROOMS.getByName(boardId).fetch(
      new Request(`https://retention.test/realtime/${boardId}`, {
        headers: {
          Upgrade: 'websocket',
          Origin: 'https://retention.test',
          Cookie: cookies.get(actor)!,
        },
      }),
    );
    expect(response.status).toBe(101);
    const ws = response.webSocket!;
    const messages: ServerMessage[] = [];
    const waiters: (() => void)[] = [];
    ws.addEventListener('message', (e) => {
      messages.push(serverMessage.parse(JSON.parse(String(e.data))));
      waiters.splice(0).forEach((fn) => fn());
    });
    ws.accept();
    async function next(type: ServerMessage['type']) {
      for (let n = 0; n < 30; n++) {
        const index = messages.findIndex((message) => message.type === type);
        if (index >= 0) return messages.splice(index, 1)[0];
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, 100);
          waiters.push(() => {
            clearTimeout(timer);
            resolve();
          });
        });
      }
      throw new Error(`Missing ${type}`);
    }
    return { ws, messages, next };
  }
  return {
    owner,
    editor,
    viewer,
    outsider,
    workspaceId,
    boardId,
    cardId,
    mutationId,
    request,
    preview,
    input,
    socket,
  };
}

it('compacts a reviewed batch once, retaining current data, UUID receipts, recent/recently-created events and lifetime budgets', async () => {
  const f = await fixture(),
    before = await loadSnapshot(env.DB, f.boardId);
  const quotas = await env.DB.prepare(
    'SELECT * FROM quotas ORDER BY key',
  ).all();
  const preview = await f.preview();
  expect(preview.eligibleEvents).toBe(159);
  expect(preview.batch).toEqual({ afterRevision: 0, throughRevision: 101 });
  const input = f.input(preview);
  const first = await POST(f.request(f.owner, 'POST', input));
  expect(first.status).toBe(200);
  expect(await first.json()).toMatchObject({
    eligibleEvents: 59,
    prunedEvents: 100,
    prunedThroughRevision: 101,
  });
  // Repeating the exact request after a lost response must not clear the next batch.
  const retry = await POST(f.request(f.owner, 'POST', input));
  expect(retry.status).toBe(200);
  expect(await retry.json()).toMatchObject({
    eligibleEvents: 59,
    prunedEvents: 100,
  });
  expect(await loadSnapshot(env.DB, f.boardId)).toEqual(before);
  expect(
    (await env.DB.prepare('SELECT * FROM quotas ORDER BY key').all()).results,
  ).toEqual(quotas.results);
  expect(
    await env.DB.prepare(
      'SELECT COUNT(*) AS count FROM board_events WHERE board_id=?',
    )
      .bind(f.boardId)
      .first(),
  ).toEqual({ count: 360 });
  expect(
    await env.DB.prepare(
      'SELECT payload,payload_pruned,actor_id,client_mutation_id,revision FROM board_events WHERE board_id=? AND revision=1',
    )
      .bind(f.boardId)
      .first(),
  ).toEqual({
    payload: '{}',
    payload_pruned: 1,
    actor_id: f.owner,
    client_mutation_id: f.mutationId,
    revision: 1,
  });
  expect(
    await env.DB.prepare(
      'SELECT COUNT(*) AS count FROM board_events WHERE board_id=? AND revision>160 AND payload_pruned=0',
    )
      .bind(f.boardId)
      .first(),
  ).toEqual({ count: 200 });
  const activity = await ACTIVITY(
    new Request(
      `https://retention.test/api/boards/${f.boardId}/activity?before=102`,
      { headers: f.request().headers },
    ),
  );
  expect(await activity.json()).toMatchObject({
    events: [{ revision: 2 }],
    nextBefore: null,
    prunedThroughRevision: 101,
  });
});

it('rejects visitors, non-owners, forged confirmations, new cutoffs, recent history, oversized batches and stale previews', async () => {
  const f = await fixture(),
    data = await f.preview(),
    input = f.input(data);
  expect((await GET(f.request(''))).status).toBe(401);
  for (const actor of [f.editor, f.viewer, f.outsider]) {
    expect((await GET(f.request(actor))).status).toBe(403);
    expect((await POST(f.request(actor, 'POST', input))).status).toBe(403);
  }
  for (const change of [
    { boardId: crypto.randomUUID() },
    { before: new Date().toISOString() },
    { batch: { afterRevision: 359, throughRevision: 360 } },
    { batch: { afterRevision: 0, throughRevision: 160 } },
  ])
    expect(
      (await POST(f.request(f.owner, 'POST', { ...input, ...change }))).status,
    ).toBe(400);
  expect(
    (
      await POST(
        f.request(f.owner, 'POST', { ...input, expectedRevision: 359 }),
      )
    ).status,
  ).toBe(409);
  expect(
    await env.DB.prepare(
      'SELECT COUNT(*) AS count FROM board_events WHERE board_id=? AND payload_pruned=1',
    )
      .bind(f.boardId)
      .first(),
  ).toEqual({ count: 0 });
});

it('rolls back compaction when ownership or revision changes between the preview and the write batch', async () => {
  for (const race of ['owner', 'revision']) {
    const f = await fixture(),
      input = f.input(await f.preview());
    const binding = new Proxy(env.DB, {
      get(target, property) {
        if (property === 'batch')
          return async (statements: D1PreparedStatement[]) => {
            if (race === 'owner')
              await target.batch([
                target
                  .prepare(
                    "UPDATE workspace_members SET role='EDITOR' WHERE workspace_id=? AND user_id=?",
                  )
                  .bind(f.workspaceId, f.owner),
                target
                  .prepare(
                    "UPDATE workspace_members SET role='OWNER' WHERE workspace_id=? AND user_id=?",
                  )
                  .bind(f.workspaceId, f.editor),
                target
                  .prepare('UPDATE workspaces SET owner_id=? WHERE id=?')
                  .bind(f.editor, f.workspaceId),
              ]);
            else
              await target
                .prepare('UPDATE boards SET revision=361 WHERE id=?')
                .bind(f.boardId)
                .run();
            return target.batch(statements);
          };
        const value: unknown = Reflect.get(target, property, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    await expect(
      pruneHistory(binding, f.workspaceId, f.owner, input),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      await env.DB.prepare(
        'SELECT history_pruned_through FROM boards WHERE id=?',
      )
        .bind(f.boardId)
        .first(),
    ).toEqual({ history_pruned_through: 0 });
    expect(
      await env.DB.prepare(
        'SELECT COUNT(*) AS count FROM board_events WHERE board_id=? AND payload_pruned=1',
      )
        .bind(f.boardId)
        .first(),
    ).toEqual({ count: 0 });
  }
});

it('deduplicates pruned mutations after object eviction and refreshes only their original actor', async () => {
  const f = await fixture();
  expect(
    (await POST(f.request(f.owner, 'POST', f.input(await f.preview())))).status,
  ).toBe(200);
  await evictDurableObject(env.BOARD_ROOMS.getByName(f.boardId));
  const actor = await f.socket(),
    peer = await f.socket(f.editor);
  try {
    await actor.next('ready');
    await peer.next('ready');
    actor.ws.send(
      JSON.stringify({
        type: 'mutate',
        mutation: {
          clientMutationId: f.mutationId,
          baseRevision: 0,
          command: {
            type: 'board.rename',
            payload: { id: f.boardId, title: 'Must never be written' },
          },
        },
      }),
    );
    expect(await actor.next('snapshot')).toMatchObject({
      snapshot: { board: { name: 'Current board', revision: 360 } },
    });
    expect(await actor.next('ack')).toMatchObject({
      clientMutationId: f.mutationId,
      revision: 1,
    });
    expect(
      peer.messages.some(
        (message) => message.type === 'event' || message.type === 'snapshot',
      ),
    ).toBe(false);
    peer.ws.send(
      JSON.stringify({
        type: 'mutate',
        mutation: {
          clientMutationId: f.mutationId,
          baseRevision: 360,
          command: {
            type: 'board.rename',
            payload: { id: f.boardId, title: 'Another actor' },
          },
        },
      }),
    );
    expect(await peer.next('error')).toMatchObject({
      message: 'Mutation ID belongs to another actor',
    });
    expect((await loadSnapshot(env.DB, f.boardId)).board).toMatchObject({
      name: 'Current board',
      revision: 360,
    });
  } finally {
    actor.ws.close();
    peer.ws.close();
  }
});

it('replays the full protected 200-event window and uses a canonical snapshot for older clients', async () => {
  const f = await fixture();
  await POST(f.request(f.owner, 'POST', f.input(await f.preview())));
  const client = await f.socket();
  try {
    await client.next('ready');
    client.ws.send(JSON.stringify({ type: 'resync', lastSeenRevision: 160 }));
    const revisions: number[] = [];
    for (let n = 0; n < 200; n++) {
      const message = await client.next('event');
      if (message.type === 'event') revisions.push(message.event.revision);
    }
    expect(revisions).toEqual(Array.from({ length: 200 }, (_, i) => 161 + i));
    client.ws.send(JSON.stringify({ type: 'resync', lastSeenRevision: 1 }));
    expect(await client.next('snapshot')).toMatchObject({
      snapshot: {
        board: { revision: 360 },
        cards: [{ title: 'Keep this task' }],
      },
    });
  } finally {
    client.ws.close();
  }
});

it('round-trips a pruned board through checksum validation, interrupted staging, receipt retries and cleanup into a separate new board', async () => {
  const f = await fixture();
  await POST(f.request(f.owner, 'POST', f.input(await f.preview())));
  const source = await loadSnapshot(env.DB, f.boardId);
  const backup = await createBoardBackup(source, [
    { id: f.owner, name: 'Owner' },
    { id: f.editor, name: 'Editor' },
  ]);
  const transfer = await prepareRestore(backup),
    jobId = crypto.randomUUID();
  const first = await startRestore(env.DB, f.workspaceId, f.owner, {
    jobId,
    root: transfer.root,
    header: transfer.header,
    proof: transfer.proof,
    assignees: { [f.editor]: f.editor },
  });
  const stub = env.BOARD_ROOMS.getByName(first.boardId);
  for (const items of restoreChunks(transfer.items)) {
    expect((await stub.restoreUpload(jobId, f.owner, items)).ok).toBe(true);
    await evictDurableObject(stub);
    // Resume with the immutable original chunk instead of duplicate copied rows.
    expect((await stub.restoreUpload(jobId, f.owner, items)).ok).toBe(true);
  }
  const complete = await completeRestore(env.DB, jobId, f.owner);
  const retried = await stub.restoreComplete(jobId, f.owner);
  expect(retried.ok).toBe(true);
  expect(
    await env.DB.prepare(
      'SELECT COUNT(*) AS count FROM boards WHERE workspace_id=?',
    )
      .bind(f.workspaceId)
      .first(),
  ).toEqual({ count: 2 });
  const recovered = await loadSnapshot(env.DB, complete.boardId);
  expect(recovered.board).toMatchObject({
    name: source.board.name,
    revision: 1,
  });
  expect(recovered.cards).toMatchObject([
    {
      title: 'Keep this task',
      description: '原始內容 still available',
      assigneeId: f.editor,
      dueDate: '2026-12-01',
    },
  ]);
  expect(recovered.comments).toMatchObject([
    { body: 'Keep this comment', importedAuthorName: 'Owner' },
  ]);
  await cleanRestore(env.DB, jobId, f.owner);
  expect(await loadSnapshot(env.DB, f.boardId)).toEqual(source);
  expect((await previewHistory(env.DB, f.boardId, f.owner)).prunedEvents).toBe(
    100,
  );
});
