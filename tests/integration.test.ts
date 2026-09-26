import { env } from 'cloudflare:workers';
import { evictDurableObject } from 'cloudflare:test';
import { POST as uploadRoute } from '../app/api/cards/[cardId]/attachments/route';
import { it, expect, beforeEach } from 'vitest';
import { createSession } from '../src/auth/session';
import {
  serverMessage,
  type ServerMessage,
  type Command,
} from '../src/realtime/protocol';
beforeEach(async () => {
  await env.DB.prepare('DELETE FROM quotas').run();
});
async function fixture(role = 'OWNER') {
  const userId = crypto.randomUUID(),
    workspaceId = crypto.randomUUID(),
    boardId = crypto.randomUUID(),
    columnId = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO users(id,email,name,password,created_at) VALUES(?,?,?,?,?)',
    ).bind(userId, `${userId}@test.dev`, 'Alice', 'unused', Date.now()),
    env.DB.prepare('INSERT INTO workspaces VALUES(?,?,?)').bind(
      workspaceId,
      'Acme',
      userId,
    ),
    env.DB.prepare('INSERT INTO workspace_members VALUES(?,?,?)').bind(
      workspaceId,
      userId,
      role,
    ),
    env.DB.prepare(
      'INSERT INTO boards(id,workspace_id,name,revision) VALUES(?,?,?,0)',
    ).bind(boardId, workspaceId, 'Launch'),
    env.DB.prepare('INSERT INTO board_columns VALUES(?,?,?,?,0,0)').bind(
      columnId,
      boardId,
      'Backlog',
      0,
    ),
  ]);
  const cookie = (
    await createSession(userId, new Request('https://test.dev'))
  ).split(';')[0];
  const stub = env.BOARD_ROOMS.getByName(boardId);
  const response = await stub.fetch(
    new Request(`https://test.dev/realtime/${boardId}`, {
      headers: {
        Upgrade: 'websocket',
        Origin: 'https://test.dev',
        Cookie: cookie,
      },
    }),
  );
  expect(response.status).toBe(101);
  const ws = response.webSocket!;
  ws.accept();
  const messages: ServerMessage[] = [];
  const waiters: (() => void)[] = [];
  ws.addEventListener('message', (e) => {
    messages.push(serverMessage.parse(JSON.parse(String(e.data))));
    waiters.splice(0).forEach((w) => w());
  });
  async function next(type: ServerMessage['type']): Promise<ServerMessage> {
    for (let tries = 0; tries < 30; tries++) {
      const index = messages.findIndex((m) => m.type === type);
      if (index >= 0) return messages.splice(index, 1)[0];
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 100);
        waiters.push(() => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
    throw new Error(`Missing ${type}: ${JSON.stringify(messages)}`);
  }
  function mutate(
    command: Command,
    baseRevision = 0,
    clientMutationId = crypto.randomUUID(),
  ) {
    ws.send(
      JSON.stringify({
        type: 'mutate',
        mutation: { command, baseRevision, clientMutationId },
      }),
    );
    return clientMutationId;
  }
  return { ws, next, mutate, stub, boardId, columnId, userId, workspaceId };
}
it('persists board lifecycle events and deduplicates archive delivery', async () => {
  const f = await fixture();
  try {
    f.mutate({
      type: 'board.rename',
      payload: { id: f.boardId, title: 'Renamed board' },
    });
    expect(await f.next('ack')).toMatchObject({ revision: 1 });
    const command = {
      type: 'board.archive' as const,
      payload: { id: f.boardId },
    };
    const id = f.mutate(command, 1);
    expect(await f.next('ack')).toMatchObject({ revision: 2 });
    f.mutate(command, 1, id);
    expect(await f.next('ack')).toMatchObject({ revision: 2 });
    expect(
      await env.DB.prepare(
        'SELECT name,name_revision,archived,revision FROM boards WHERE id=?',
      )
        .bind(f.boardId)
        .first(),
    ).toMatchObject({
      name: 'Renamed board',
      name_revision: 1,
      archived: 1,
      revision: 2,
    });
    f.mutate(
      {
        type: 'column.create',
        payload: { id: crypto.randomUUID(), title: 'Rejected' },
      },
      2,
    );
    expect(await f.next('error')).toMatchObject({
      message: 'This board is archived',
    });
  } finally {
    f.ws.close();
  }
});

it('persists metadata and restores cards and boards without deleting history', async () => {
  const f = await fixture();
  const cardId = crypto.randomUUID();
  try {
    f.mutate({
      type: 'card.create',
      payload: { id: cardId, columnId: f.columnId, title: 'Track this' },
    });
    await f.next('ack');
    f.mutate(
      {
        type: 'card.update',
        payload: { id: cardId, assigneeId: crypto.randomUUID() },
      },
      1,
    );
    expect(await f.next('error')).toMatchObject({
      message: 'Assignee must be a current workspace member',
    });
    expect((await f.stub.snapshot(f.boardId, f.userId)).board.revision).toBe(1);
    f.mutate(
      {
        type: 'card.update',
        payload: { id: cardId, assigneeId: f.userId, dueDate: '2027-01-15' },
      },
      1,
    );
    await f.next('ack');
    f.mutate(
      { type: 'card.update', payload: { id: cardId, dueDate: '2027-01-16' } },
      1,
    );
    await f.next('conflict');
    f.mutate({ type: 'card.archive', payload: { id: cardId } }, 2);
    await f.next('ack');
    const restoreId = crypto.randomUUID();
    f.mutate({ type: 'card.restore', payload: { id: cardId } }, 3, restoreId);
    await f.next('ack');
    f.mutate({ type: 'card.restore', payload: { id: cardId } }, 3, restoreId);
    expect(await f.next('ack')).toMatchObject({ revision: 4 });
    f.mutate({ type: 'board.archive', payload: { id: f.boardId } }, 4);
    await f.next('ack');
    f.mutate({ type: 'board.restore', payload: { id: f.boardId } }, 4);
    await f.next('conflict');
    f.mutate({ type: 'board.restore', payload: { id: f.boardId } }, 5);
    await f.next('ack');
    const snapshot = await f.stub.snapshot(f.boardId, f.userId);
    expect(snapshot.board).toMatchObject({ revision: 6, archived: false });
    expect(snapshot.cards[0]).toMatchObject({
      archived: false,
      assigneeId: f.userId,
      dueDate: '2027-01-15',
      assigneeRevision: 2,
      dueDateRevision: 2,
    });
    expect(
      (
        await env.DB.prepare(
          'SELECT COUNT(*) AS count FROM board_events WHERE board_id=?',
        )
          .bind(f.boardId)
          .first<{ count: number }>()
      )?.count,
    ).toBe(6);
  } finally {
    f.ws.close();
  }
});
it('commits one revision atomically, deduplicates, replays, and falls back to snapshots', async () => {
  const f = await fixture();
  try {
    const cardId = crypto.randomUUID();
    const command = {
      type: 'card.create' as const,
      payload: { id: cardId, columnId: f.columnId, title: 'First card' },
    };
    const mutationId = f.mutate(command);
    const ack = await f.next('ack');
    expect(ack).toMatchObject({ revision: 1 });
    f.mutate(command, 0, mutationId);
    expect(await f.next('ack')).toMatchObject({ revision: 1 });
    const snapshot = await f.stub.snapshot(f.boardId, f.userId);
    expect(snapshot.cards).toHaveLength(1);
    expect(snapshot.board.revision).toBe(1);
    f.mutate(
      { type: 'card.update', payload: { id: cardId, title: 'Changed' } },
      1,
    );
    expect(await f.next('ack')).toMatchObject({ revision: 2 });
    f.mutate(
      { type: 'card.update', payload: { id: cardId, title: 'Stale' } },
      1,
    );
    expect(await f.next('conflict')).toMatchObject({ serverRevision: 2 });
    // Drain live events before asserting replay.
    await f.next('event');
    await f.next('event');
    await f.next('event');
    f.ws.send(JSON.stringify({ type: 'resync', lastSeenRevision: 1 }));
    expect(await f.next('event')).toMatchObject({ event: { revision: 2 } });
    f.ws.send(JSON.stringify({ type: 'resync', lastSeenRevision: 999 }));
    expect(await f.next('snapshot')).toMatchObject({
      snapshot: { board: { revision: 2 } },
    });
  } finally {
    f.ws.close();
  }
});
it('reorders a full column in one transactional D1 update', async () => {
  const f = await fixture();
  const ids = Array.from({ length: 120 }, () => crypto.randomUUID());
  try {
    await env.DB.prepare(
      `INSERT INTO cards(id,board_id,column_id,title,description,position,archived,updated_revision,title_revision,description_revision)
       SELECT value, ?, ?, 'Bulk card', '', CAST(key AS INTEGER), 0, 0, 0, 0
       FROM json_each(?)`,
    )
      .bind(f.boardId, f.columnId, JSON.stringify(ids))
      .run();
    f.mutate({
      type: 'card.move',
      payload: {
        id: ids[119],
        columnId: f.columnId,
        beforeId: ids[0],
      },
    });
    expect(await f.next('ack')).toMatchObject({ revision: 1 });
    const rows = await env.DB.prepare(
      'SELECT id,position,updated_revision FROM cards WHERE board_id=? ORDER BY position',
    )
      .bind(f.boardId)
      .all<{ id: string; position: number; updated_revision: number }>();
    expect(rows.results.map((row) => row.id)).toEqual([
      ids[119],
      ...ids.slice(0, 119),
    ]);
    expect(rows.results.map((row) => row.position)).toEqual(
      Array.from({ length: 120 }, (_, index) => index),
    );
    expect(rows.results.every((row) => row.updated_revision === 1)).toBe(true);
    expect((await f.stub.snapshot(f.boardId, f.userId)).board.revision).toBe(1);
    await env.DB.prepare('UPDATE quotas SET used=2000 WHERE key=?')
      .bind(`mutations:${new Date().toISOString().slice(0, 10)}`)
      .run();
    f.mutate(
      {
        type: 'card.move',
        payload: { id: ids[119], columnId: f.columnId, beforeId: null },
      },
      1,
    );
    await f.next('error');
    const afterFailure = await env.DB.prepare(
      'SELECT id FROM cards WHERE board_id=? ORDER BY position',
    )
      .bind(f.boardId)
      .all<{ id: string }>();
    expect(afterFailure.results.map((row) => row.id)).toEqual([
      ids[119],
      ...ids.slice(0, 119),
    ]);
    expect((await f.stub.snapshot(f.boardId, f.userId)).board.revision).toBe(1);
  } finally {
    f.ws.close();
  }
});
it('rejects viewer mutations on the server', async () => {
  const f = await fixture('VIEWER');
  try {
    f.mutate({
      type: 'card.create',
      payload: {
        id: crypto.randomUUID(),
        columnId: f.columnId,
        title: 'Forbidden',
      },
    });
    expect(await f.next('error')).toMatchObject({
      message: 'Viewers cannot make changes',
    });
    expect((await f.stub.snapshot(f.boardId, f.userId)).board.revision).toBe(0);
  } finally {
    f.ws.close();
  }
});
it('revokes event and presence recipients after workspace access is removed', async () => {
  const f = await fixture();
  const otherId = crypto.randomUUID();
  let other: WebSocket | undefined;
  try {
    await env.DB.batch([
      env.DB.prepare(
        'INSERT INTO users(id,email,name,password,created_at) VALUES(?,?,?,?,?)',
      ).bind(otherId, `${otherId}@test.dev`, 'Bob', 'unused', Date.now()),
      env.DB.prepare('INSERT INTO workspace_members VALUES(?,?,?)').bind(
        f.workspaceId,
        otherId,
        'EDITOR',
      ),
    ]);
    const cookie = (
      await createSession(otherId, new Request('https://test.dev'))
    ).split(';')[0];
    const response = await f.stub.fetch(
      new Request(`https://test.dev/realtime/${f.boardId}`, {
        headers: {
          Upgrade: 'websocket',
          Origin: 'https://test.dev',
          Cookie: cookie,
        },
      }),
    );
    expect(response.status).toBe(101);
    other = response.webSocket!;
    other.accept();
    const otherMessages: ServerMessage[] = [];
    other.addEventListener('message', (e) => {
      otherMessages.push(serverMessage.parse(JSON.parse(String(e.data))));
    });
    const closed = new Promise<void>((resolve) => {
      other?.addEventListener('close', () => resolve(), { once: true });
    });
    await env.DB.prepare(
      'DELETE FROM workspace_members WHERE workspace_id=? AND user_id=?',
    )
      .bind(f.workspaceId, otherId)
      .run();
    f.mutate({
      type: 'board.rename',
      payload: { id: f.boardId, title: 'Still private' },
    });
    expect(await f.next('ack')).toMatchObject({ revision: 1 });
    await closed;
    expect(
      otherMessages.some(
        (message) => message.type === 'event' && message.event.revision === 1,
      ),
    ).toBe(false);
    f.ws.send(JSON.stringify({ type: 'presence', status: 'active' }));
    for (let i = 0; i < 4; i++) {
      const message = await f.next('presence');
      if (message.type !== 'presence') continue;
      if (message.users.every((user) => user.userId === f.userId)) return;
    }
    throw new Error('Revoked user remained in presence');
  } finally {
    other?.close();
    f.ws.close();
  }
});
it('rolls back entity, revision and event if persistence fails', async () => {
  const f = await fixture();
  try {
    await env.DB.prepare('INSERT INTO quotas VALUES(?,2000)')
      .bind(`mutations:${new Date().toISOString().slice(0, 10)}`)
      .run();
    f.mutate({
      type: 'card.create',
      payload: {
        id: crypto.randomUUID(),
        columnId: f.columnId,
        title: 'Rolled back',
      },
    });
    await f.next('error');
    const snapshot = await f.stub.snapshot(f.boardId, f.userId);
    expect(snapshot.cards).toHaveLength(0);
    expect(snapshot.board.revision).toBe(0);
    const count = await env.DB.prepare(
      'SELECT count(*) AS n FROM board_events WHERE board_id=?',
    )
      .bind(f.boardId)
      .first<{ n: number }>();
    expect(count?.n).toBe(0);
  } finally {
    f.ws.close();
  }
});
it('enforces a persistent limiter rather than per-isolate counters', async () => {
  const limiter = env.AUTH_LIMITER.getByName(crypto.randomUUID());
  expect(await limiter.consume({ limit: 2, windowMs: 60000 })).toBe(true);
  expect(await limiter.consume({ limit: 2, windowMs: 60000 })).toBe(true);
  expect(await limiter.consume({ limit: 2, windowMs: 60000 })).toBe(false);
});
it('resumes hibernated sockets without losing ordering or deduplication', async () => {
  const f = await fixture();
  try {
    const command = {
      type: 'card.create' as const,
      payload: {
        id: crypto.randomUUID(),
        columnId: f.columnId,
        title: 'Survives hibernation',
      },
    };
    const mutationId = f.mutate(command);
    await f.next('ack');
    await evictDurableObject(f.stub);
    f.mutate(command, 0, mutationId);
    expect(await f.next('ack')).toMatchObject({ revision: 1 });
    expect((await f.stub.snapshot(f.boardId, f.userId)).cards).toHaveLength(1);
  } finally {
    f.ws.close();
  }
});
it('keeps R2 private and enforces upload permissions before object creation', async () => {
  const f = await fixture();
  try {
    const cardId = crypto.randomUUID();
    f.mutate({
      type: 'card.create',
      payload: { id: cardId, columnId: f.columnId, title: 'File card' },
    });
    await f.next('ack');
    const bytes = new TextEncoder().encode('Private project notes').buffer;
    const file = await f.stub.upload(
      f.boardId,
      f.userId,
      cardId,
      { filename: 'notes.txt', mime: 'text/plain', size: bytes.byteLength },
      bytes,
    );
    expect((await f.stub.snapshot(f.boardId, f.userId)).attachments[0].id).toBe(
      file.id,
    );
    expect(await env.ATTACHMENTS.get(`${f.boardId}/${file.id}`)).not.toBeNull();
    await env.DB.prepare(
      "UPDATE workspace_members SET role='VIEWER' WHERE workspace_id=? AND user_id=?",
    )
      .bind(f.workspaceId, f.userId)
      .run();
    const cookie = (
      await createSession(f.userId, new Request('https://test.dev'))
    ).split(';')[0];
    const response = await uploadRoute(
      new Request(`https://test.dev/api/cards/${cardId}/attachments`, {
        method: 'POST',
        headers: {
          Origin: 'https://test.dev',
          Cookie: cookie,
          'Content-Type': 'text/plain',
          'Content-Length': String(bytes.byteLength),
          'X-Filename': 'forbidden.txt',
        },
        body: bytes,
      }),
    );
    expect(response.status).toBe(403);
    expect(
      (await f.stub.snapshot(f.boardId, f.userId)).attachments,
    ).toHaveLength(1);
  } finally {
    f.ws.close();
  }
});
