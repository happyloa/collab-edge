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
    env.DB.prepare('INSERT INTO users VALUES(?,?,?,?,?)').bind(
      userId,
      `${userId}@test.dev`,
      'Alice',
      'unused',
      Date.now(),
    ),
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
