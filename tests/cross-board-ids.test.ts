import { env } from 'cloudflare:workers';
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

async function board() {
  const userId = crypto.randomUUID(),
    workspaceId = crypto.randomUUID(),
    boardId = crypto.randomUUID(),
    columnId = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO users(id,email,name,password,created_at) VALUES(?,?,?,?,?)',
    ).bind(userId, `${userId}@test.dev`, 'Member', 'unused', Date.now()),
    env.DB.prepare('INSERT INTO workspaces VALUES(?,?,?)').bind(
      workspaceId,
      'Acme',
      userId,
    ),
    env.DB.prepare('INSERT INTO workspace_members VALUES(?,?,?)').bind(
      workspaceId,
      userId,
      'OWNER',
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
  const response = await env.BOARD_ROOMS.getByName(boardId).fetch(
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
  async function next(
    ...types: ServerMessage['type'][]
  ): Promise<ServerMessage> {
    for (let tries = 0; tries < 30; tries++) {
      const index = messages.findIndex((m) => types.includes(m.type));
      if (index >= 0) return messages.splice(index, 1)[0];
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 100);
        waiters.push(() => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
    throw new Error(`Missing ${types.join('/')}: ${JSON.stringify(messages)}`);
  }
  function mutate(command: Command, baseRevision = 0) {
    ws.send(
      JSON.stringify({
        type: 'mutate',
        mutation: {
          command,
          baseRevision,
          clientMutationId: crypto.randomUUID(),
        },
      }),
    );
  }
  return { ws, next, mutate, boardId, columnId };
}

it('rejects card IDs that already belong to another board', async () => {
  const victim = await board();
  const attacker = await board();
  const cardId = crypto.randomUUID();
  try {
    victim.mutate({
      type: 'card.create',
      payload: { id: cardId, columnId: victim.columnId, title: 'Confidential' },
    });
    expect(await victim.next('ack')).toMatchObject({ revision: 1 });

    // The attacker has no access to the victim board, only knowledge of an ID.
    attacker.mutate({
      type: 'card.create',
      payload: {
        id: cardId,
        columnId: attacker.columnId,
        title: 'Overwritten',
      },
    });
    expect((await attacker.next('ack', 'error')).type).toBe('error');

    expect(
      await env.DB.prepare(
        'SELECT board_id,column_id,title FROM cards WHERE id=?',
      )
        .bind(cardId)
        .first(),
    ).toEqual({
      board_id: victim.boardId,
      column_id: victim.columnId,
      title: 'Confidential',
    });
    // The rejected mutation must not advance the attacker's board either.
    expect(
      await env.DB.prepare('SELECT revision FROM boards WHERE id=?')
        .bind(attacker.boardId)
        .first(),
    ).toEqual({ revision: 0 });
    expect(
      await env.DB.prepare(
        'SELECT count(*) AS total FROM board_events WHERE board_id=?',
      )
        .bind(attacker.boardId)
        .first(),
    ).toEqual({ total: 0 });
  } finally {
    victim.ws.close();
    attacker.ws.close();
  }
});

it('rejects column IDs that already belong to another board', async () => {
  const victim = await board();
  const attacker = await board();
  try {
    attacker.mutate({
      type: 'column.create',
      payload: { id: victim.columnId, title: 'Overwritten' },
    });
    expect((await attacker.next('ack', 'error')).type).toBe('error');

    expect(
      await env.DB.prepare(
        'SELECT board_id,title FROM board_columns WHERE id=?',
      )
        .bind(victim.columnId)
        .first(),
    ).toEqual({ board_id: victim.boardId, title: 'Backlog' });
    expect(
      await env.DB.prepare('SELECT revision FROM boards WHERE id=?')
        .bind(attacker.boardId)
        .first(),
    ).toEqual({ revision: 0 });
  } finally {
    victim.ws.close();
    attacker.ws.close();
  }
});

it('still creates cards and columns with fresh IDs', async () => {
  const f = await board();
  const cardId = crypto.randomUUID(),
    columnId = crypto.randomUUID();
  try {
    f.mutate({
      type: 'column.create',
      payload: { id: columnId, title: 'Review' },
    });
    expect(await f.next('ack')).toMatchObject({ revision: 1 });
    f.mutate(
      { type: 'card.create', payload: { id: cardId, columnId, title: 'Task' } },
      1,
    );
    expect(await f.next('ack')).toMatchObject({ revision: 2 });
    f.mutate(
      { type: 'card.update', payload: { id: cardId, title: 'Renamed task' } },
      2,
    );
    expect(await f.next('ack')).toMatchObject({ revision: 3 });
    expect(
      await env.DB.prepare('SELECT board_id,title FROM cards WHERE id=?')
        .bind(cardId)
        .first(),
    ).toEqual({ board_id: f.boardId, title: 'Renamed task' });
  } finally {
    f.ws.close();
  }
});

it('keeps a card and its column on one board at the database level', async () => {
  const home = await board();
  const other = await board();
  const cardId = crypto.randomUUID();
  const insertCard = (boardId: string, columnId: string, id: string) =>
    env.DB.prepare(
      'INSERT INTO cards(id,board_id,column_id,title,position,updated_revision,title_revision,description_revision) VALUES(?,?,?,?,0,0,0,0)',
    )
      .bind(id, boardId, columnId, 'Card')
      .run();
  try {
    await expect(
      insertCard(home.boardId, other.columnId, crypto.randomUUID()),
    ).rejects.toThrow(/Card column is not on this board/);
    await insertCard(home.boardId, home.columnId, cardId);
    await expect(
      env.DB.prepare('UPDATE cards SET column_id=? WHERE id=?')
        .bind(other.columnId, cardId)
        .run(),
    ).rejects.toThrow(/Card column is not on this board/);
    await expect(
      env.DB.prepare('UPDATE cards SET board_id=? WHERE id=?')
        .bind(other.boardId, cardId)
        .run(),
    ).rejects.toThrow(/Card column is not on this board/);
    await expect(
      env.DB.prepare('UPDATE board_columns SET board_id=? WHERE id=?')
        .bind(other.boardId, home.columnId)
        .run(),
    ).rejects.toThrow(/Column cannot move to another board/);
    // The unscoped upsert that once crossed boards is refused by the schema.
    await expect(
      env.DB.prepare(
        'INSERT INTO cards(id,board_id,column_id,title,position,updated_revision,title_revision,description_revision) VALUES(?,?,?,?,0,0,0,0) ON CONFLICT(id) DO UPDATE SET column_id=excluded.column_id,title=excluded.title',
      )
        .bind(cardId, other.boardId, other.columnId, 'Overwritten')
        .run(),
    ).rejects.toThrow(/Card column is not on this board/);
    expect(
      await env.DB.prepare(
        'SELECT board_id,column_id,title FROM cards WHERE id=?',
      )
        .bind(cardId)
        .first(),
    ).toEqual({
      board_id: home.boardId,
      column_id: home.columnId,
      title: 'Card',
    });
  } finally {
    home.ws.close();
    other.ws.close();
  }
});
