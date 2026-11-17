import { env } from 'cloudflare:workers';
import { it, expect, beforeEach } from 'vitest';
import { createSession } from '../src/auth/session';
import { commitStatements } from '../src/realtime/commit';
import {
  serverMessage,
  type ServerMessage,
  type Command,
  type BoardEvent,
} from '../src/realtime/protocol';

beforeEach(async () => {
  await env.DB.prepare('DELETE FROM quotas').run();
});

async function connect(boardId: string, userId: string) {
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
  async function next<T extends ServerMessage['type']>(type: T) {
    for (let tries = 0; tries < 30; tries++) {
      const index = messages.findIndex((m) => m.type === type);
      if (index >= 0)
        return messages.splice(index, 1)[0] as Extract<
          ServerMessage,
          { type: T }
        >;
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
    baseRevision: number,
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
  return { ws, next, mutate };
}

/** A board with one card, its workspace owner and a second editor. */
async function fixture() {
  const owner = crypto.randomUUID(),
    editor = crypto.randomUUID(),
    workspaceId = crypto.randomUUID(),
    boardId = crypto.randomUUID(),
    columnId = crypto.randomUUID(),
    cardId = crypto.randomUUID();
  await env.DB.batch([
    ...[owner, editor].map((id) =>
      env.DB.prepare(
        'INSERT INTO users(id,email,name,password,created_at) VALUES(?,?,?,?,?)',
      ).bind(id, `${id}@test.dev`, 'Member', 'unused', Date.now()),
    ),
    env.DB.prepare('INSERT INTO workspaces VALUES(?,?,?)').bind(
      workspaceId,
      'Acme',
      owner,
    ),
    env.DB.prepare('INSERT INTO workspace_members VALUES(?,?,?)').bind(
      workspaceId,
      owner,
      'OWNER',
    ),
    env.DB.prepare('INSERT INTO workspace_members VALUES(?,?,?)').bind(
      workspaceId,
      editor,
      'EDITOR',
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
  const a = await connect(boardId, owner);
  const b = await connect(boardId, editor);
  a.mutate(
    { type: 'card.create', payload: { id: cardId, columnId, title: 'Card' } },
    0,
  );
  expect(await a.next('ack')).toMatchObject({ revision: 1 });
  const close = () => {
    a.ws.close();
    b.ws.close();
  };
  return { owner, editor, workspaceId, boardId, cardId, a, b, close };
}
const comment = (id: string) =>
  env.DB.prepare(
    'SELECT actor_id,body,body_revision,edited_at FROM card_comments WHERE id=?',
  )
    .bind(id)
    .first<{
      actor_id: string;
      body: string;
      body_revision: number;
      edited_at: string | null;
    }>();
const revision = async (boardId: string) =>
  (
    await env.DB.prepare('SELECT revision FROM boards WHERE id=?')
      .bind(boardId)
      .first<{ revision: number }>()
  )?.revision;

it('edits a comment for its author only and broadcasts the result', async () => {
  const f = await fixture();
  const id = crypto.randomUUID();
  try {
    f.b.mutate(
      {
        type: 'comment.create',
        payload: { id, cardId: f.cardId, body: 'Frist' },
      },
      1,
    );
    expect(await f.b.next('ack')).toMatchObject({ revision: 2 });
    expect(await comment(id)).toMatchObject({
      body: 'Frist',
      body_revision: 0,
      edited_at: null,
    });

    // The workspace owner cannot rewrite the editor's comment, and the refusal
    // leaves the owner's connection usable.
    f.a.mutate(
      { type: 'comment.update', payload: { id, body: 'Hijacked' } },
      2,
    );
    expect(await f.a.next('error')).toMatchObject({
      message: 'Only the author can edit this comment',
    });
    expect(await revision(f.boardId)).toBe(2);

    const mutationId = f.b.mutate(
      { type: 'comment.update', payload: { id, body: '  First  ' } },
      2,
    );
    expect(await f.b.next('ack')).toMatchObject({ revision: 3 });
    const row = await comment(id);
    expect(row).toMatchObject({
      actor_id: f.editor,
      body: 'First',
      body_revision: 3,
    });
    expect(row?.edited_at).toBeTruthy();

    // The other member receives the committed edit.
    let event: BoardEvent | undefined;
    while (event?.revision !== 3) event = (await f.a.next('event')).event;
    expect(event).toMatchObject({ type: 'comment.update' });
    expect(event.payload.comments?.[0]).toMatchObject({
      id,
      body: 'First',
      bodyRevision: 3,
      editedAt: row?.edited_at,
    });

    // A retried delivery returns the original receipt instead of editing twice.
    f.b.mutate(
      { type: 'comment.update', payload: { id, body: 'First' } },
      2,
      mutationId,
    );
    expect(await f.b.next('ack')).toMatchObject({ revision: 3 });
    expect(await revision(f.boardId)).toBe(3);

    const snapshot = await env.BOARD_ROOMS.getByName(f.boardId).snapshot(
      f.boardId,
      f.owner,
    );
    expect(snapshot.comments).toEqual([
      expect.objectContaining({ id, body: 'First', bodyRevision: 3 }),
    ]);
  } finally {
    f.close();
  }
});

it('reports a stale comment edit as a conflict without overwriting', async () => {
  const f = await fixture();
  const id = crypto.randomUUID();
  try {
    f.b.mutate(
      {
        type: 'comment.create',
        payload: { id, cardId: f.cardId, body: 'One' },
      },
      1,
    );
    await f.b.next('ack');
    f.b.mutate({ type: 'comment.update', payload: { id, body: 'Two' } }, 2);
    expect(await f.b.next('ack')).toMatchObject({ revision: 3 });

    // A second tab of the same author still holds revision 2.
    const stale = f.b.mutate(
      { type: 'comment.update', payload: { id, body: 'Three' } },
      2,
    );
    const conflict = await f.b.next('conflict');
    expect(conflict).toMatchObject({
      clientMutationId: stale,
      serverRevision: 3,
    });
    expect(conflict.snapshot.comments[0]).toMatchObject({ body: 'Two' });
    expect(await comment(id)).toMatchObject({ body: 'Two', body_revision: 3 });

    f.b.mutate({ type: 'comment.remove', payload: { id } }, 2);
    expect(await f.b.next('conflict')).toMatchObject({ serverRevision: 3 });
    expect(await comment(id)).not.toBeNull();
  } finally {
    f.close();
  }
});

it('deletes a comment for its author or the workspace owner', async () => {
  const f = await fixture();
  const fromOwner = crypto.randomUUID(),
    fromEditor = crypto.randomUUID();
  try {
    f.a.mutate(
      {
        type: 'comment.create',
        payload: { id: fromOwner, cardId: f.cardId, body: 'Owner note' },
      },
      1,
    );
    expect(await f.a.next('ack')).toMatchObject({ revision: 2 });
    f.b.mutate(
      {
        type: 'comment.create',
        payload: { id: fromEditor, cardId: f.cardId, body: 'Editor note' },
      },
      2,
    );
    expect(await f.b.next('ack')).toMatchObject({ revision: 3 });

    f.b.mutate({ type: 'comment.remove', payload: { id: fromOwner } }, 3);
    expect(await f.b.next('error')).toMatchObject({
      message: 'Only the author or a workspace owner can delete this comment',
    });
    expect(await comment(fromOwner)).not.toBeNull();

    // The owner moderates the editor's comment.
    f.a.mutate({ type: 'comment.remove', payload: { id: fromEditor } }, 3);
    expect(await f.a.next('ack')).toMatchObject({ revision: 4 });
    expect(await comment(fromEditor)).toBeNull();
    let event: BoardEvent | undefined;
    while (event?.revision !== 4) event = (await f.b.next('event')).event;
    expect(event).toMatchObject({
      type: 'comment.remove',
      payload: { removedComments: [fromEditor] },
    });

    // Deleting it again succeeds without touching anything else.
    f.b.mutate({ type: 'comment.remove', payload: { id: fromEditor } }, 4);
    expect(await f.b.next('ack')).toMatchObject({ revision: 5 });
    expect(await comment(fromOwner)).toMatchObject({ body: 'Owner note' });

    f.b.mutate(
      { type: 'comment.update', payload: { id: fromEditor, body: 'Late' } },
      5,
    );
    expect(await f.b.next('error')).toMatchObject({
      message: 'Comment no longer exists',
    });

    f.a.mutate({ type: 'comment.remove', payload: { id: fromOwner } }, 5);
    expect(await f.a.next('ack')).toMatchObject({ revision: 6 });
    expect(await comment(fromOwner)).toBeNull();
  } finally {
    f.close();
  }
});

it('rechecks comment authorship inside the commit transaction', async () => {
  const f = await fixture();
  const id = crypto.randomUUID();
  try {
    f.a.mutate(
      {
        type: 'comment.create',
        payload: { id, cardId: f.cardId, body: 'Mine' },
      },
      1,
    );
    expect(await f.a.next('ack')).toMatchObject({ revision: 2 });
    // Statements built for the editor, as if the room's own check had been
    // skipped or had raced with a role change.
    const commit = (command: Command, payload: BoardEvent['payload']) =>
      env.DB.batch(
        commitStatements(env.DB, {
          baseRevision: 2,
          workspaceId: f.workspaceId,
          mutation: {
            clientMutationId: crypto.randomUUID(),
            baseRevision: 2,
            command,
          },
          event: {
            boardId: f.boardId,
            revision: 3,
            eventId: crypto.randomUUID(),
            clientMutationId: crypto.randomUUID(),
            actorId: f.editor,
            type: command.type,
            payload,
            createdAt: new Date().toISOString(),
          },
        }),
      );
    await expect(
      commit(
        { type: 'comment.update', payload: { id, body: 'Forged' } },
        {
          comments: [
            {
              id,
              cardId: f.cardId,
              boardId: f.boardId,
              actorId: f.owner,
              body: 'Forged',
              createdAt: new Date().toISOString(),
              bodyRevision: 3,
            },
          ],
        },
      ),
    ).rejects.toThrow();
    await expect(
      commit(
        { type: 'comment.remove', payload: { id } },
        { removedComments: [id] },
      ),
    ).rejects.toThrow();
    expect(await comment(id)).toMatchObject({ body: 'Mine', body_revision: 0 });
    expect(await revision(f.boardId)).toBe(2);
  } finally {
    f.close();
  }
});
