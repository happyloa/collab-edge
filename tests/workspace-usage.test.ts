import { env } from 'cloudflare:workers';
import { expect, it } from 'vitest';
import { GET } from '../app/api/workspaces/[workspaceId]/usage/route';
import { createSession } from '../src/auth/session';
import { workspaceUsage, type WorkspaceUsage } from '../src/workspaces/usage';

async function fixture() {
  const owner = crypto.randomUUID(),
    editor = crypto.randomUUID(),
    viewer = crypto.randomUUID(),
    outsider = crypto.randomUUID();
  const workspace = crypto.randomUUID(),
    foreignWorkspace = crypto.randomUUID();
  const board = crypto.randomUUID(),
    archivedBoard = crypto.randomUUID(),
    foreignBoard = crypto.randomUUID();
  const column = crypto.randomUUID(),
    card = crypto.randomUUID(),
    archivedCard = crypto.randomUUID();
  await env.DB.batch([
    ...[owner, editor, viewer, outsider].map((id) =>
      env.DB.prepare(
        'INSERT INTO users(id,email,name,password,created_at) VALUES(?,?,?,?,0)',
      ).bind(id, `${id}@usage.test`, 'Usage fixture', 'not-a-login'),
    ),
    env.DB.prepare('INSERT INTO workspaces VALUES(?,?,?)').bind(
      workspace,
      'Usage workspace',
      owner,
    ),
    env.DB.prepare('INSERT INTO workspaces VALUES(?,?,?)').bind(
      foreignWorkspace,
      'Private unrelated workspace',
      outsider,
    ),
    ...[
      [owner, 'OWNER'],
      [editor, 'EDITOR'],
      [viewer, 'VIEWER'],
    ].map(([id, role]) =>
      env.DB.prepare('INSERT INTO workspace_members VALUES(?,?,?)').bind(
        workspace,
        id,
        role,
      ),
    ),
    env.DB.prepare('INSERT INTO workspace_members VALUES(?,?,?)').bind(
      foreignWorkspace,
      outsider,
      'OWNER',
    ),
    env.DB.prepare(
      'INSERT INTO boards(id,workspace_id,name,revision) VALUES(?,?,?,7)',
    ).bind(board, workspace, 'Alpha'),
    env.DB.prepare(
      'INSERT INTO boards(id,workspace_id,name,revision,archived) VALUES(?,?,?,2,1)',
    ).bind(archivedBoard, workspace, 'Beta'),
    env.DB.prepare(
      'INSERT INTO boards(id,workspace_id,name) VALUES(?,?,?)',
    ).bind(foreignBoard, foreignWorkspace, 'Private unrelated board'),
    env.DB.prepare('INSERT INTO board_columns VALUES(?,?,?,0,0,0)').bind(
      column,
      board,
      'Backlog',
    ),
    env.DB.prepare(
      'INSERT INTO cards(id,board_id,column_id,title,position,archived,updated_revision,title_revision,description_revision) VALUES(?,?,?,?,0,?,0,0,0)',
    ).bind(card, board, column, 'Active', 0),
    env.DB.prepare(
      'INSERT INTO cards(id,board_id,column_id,title,position,archived,updated_revision,title_revision,description_revision) VALUES(?,?,?,?,1,?,0,0,0)',
    ).bind(archivedCard, board, column, 'Archived', 1),
    ...[card, card, archivedCard].map((cardId) =>
      env.DB.prepare('INSERT INTO card_comments VALUES(?,?,?,?,?,?)').bind(
        crypto.randomUUID(),
        cardId,
        board,
        owner,
        'Comment',
        '2026-10-05T00:00:00Z',
      ),
    ),
  ]);
  const cookies = new Map<string, string>();
  for (const user of [owner, editor, viewer, outsider])
    cookies.set(
      user,
      (await createSession(user, new Request('https://usage.test'))).split(
        ';',
      )[0],
    );
  const get = (actor?: string, id = workspace) =>
    GET(
      new Request(`https://usage.test/api/workspaces/${id}/usage`, {
        headers: actor ? { Cookie: cookies.get(actor)! } : {},
      }),
    );
  return {
    owner,
    editor,
    viewer,
    outsider,
    workspace,
    foreignWorkspace,
    board,
    archivedBoard,
    column,
    card,
    get,
  };
}

it('reports scoped counts, archived capacity and the busiest card without reading snapshots', async () => {
  const data = await fixture();
  const response = await data.get(data.owner);
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  const usage = (await response.json()) as WorkspaceUsage;
  expect(usage.workspaceId).toBe(data.workspace);
  expect(usage.members).toEqual({ used: 3, limit: 10 });
  expect(usage.boards).toEqual({ used: 2, limit: 5 });
  expect(usage.boardUsage).toHaveLength(2);
  expect(usage.boardUsage[0]).toMatchObject({
    id: data.board,
    cards: { used: 2, limit: 200 },
    archivedCards: 1,
    commentCount: 3,
    busiestCardComments: { used: 2, limit: 50 },
    changes: { used: 7, limit: 5000 },
  });
  expect(usage.boardUsage[1]).toMatchObject({
    id: data.archivedBoard,
    archived: true,
    cards: { used: 0 },
    busiestCardComments: { used: 0 },
  });
  expect(JSON.stringify(usage)).not.toContain('Private unrelated');
  expect(Number.isNaN(Date.parse(usage.measuredAt))).toBe(false);
  expect(
    (await workspaceUsage(env.DB, data.workspace, data.owner, false))
      .attachmentsEnabled,
  ).toBe(false);
});

it('denies editors, viewers, outsiders and anonymous requests without exposing counts', async () => {
  const data = await fixture();
  for (const actor of [data.editor, data.viewer, data.outsider]) {
    const response = await data.get(actor);
    expect(response.status).toBe(403);
    expect(await response.json()).not.toHaveProperty('boardUsage');
  }
  expect((await data.get()).status).toBe(401);
  expect((await data.get(data.owner, data.foreignWorkspace)).status).toBe(403);
  expect((await data.get(data.owner, 'invalid-id')).status).toBe(400);
});

it('rechecks the canonical owner and membership inside the measurement batch', async () => {
  const data = await fixture();
  const interrupted = new Proxy(env.DB, {
    get(target, property) {
      if (property === 'batch')
        return async (statements: D1PreparedStatement[]) => {
          await target
            .prepare('UPDATE workspaces SET owner_id=? WHERE id=?')
            .bind(data.editor, data.workspace)
            .run();
          return target.batch(statements);
        };
      const value = Reflect.get(target, property);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  await expect(
    workspaceUsage(interrupted, data.workspace, data.owner, false),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    workspaceUsage(env.DB, data.workspace, data.editor, false),
  ).rejects.toMatchObject({ status: 403 });
});

it('shows exhausted card and per-card comment quotas without changing retained data', async () => {
  const data = await fixture();
  for (let start = 0; start < 198; start += 50)
    await env.DB.batch(
      Array.from({ length: Math.min(50, 198 - start) }, (_, index) =>
        env.DB.prepare(
          'INSERT INTO cards(id,board_id,column_id,title,position,archived,updated_revision,title_revision,description_revision) VALUES(?,?,?,?,?,0,0,0,0)',
        ).bind(
          crypto.randomUUID(),
          data.board,
          data.column,
          'Quota card',
          start + index + 2,
        ),
      ),
    );
  await env.DB.batch(
    Array.from({ length: 48 }, () =>
      env.DB.prepare('INSERT INTO card_comments VALUES(?,?,?,?,?,?)').bind(
        crypto.randomUUID(),
        data.card,
        data.board,
        data.owner,
        'Quota comment',
        '2026-10-05T00:00:00Z',
      ),
    ),
  );
  const usage = await workspaceUsage(env.DB, data.workspace, data.owner, false);
  expect(usage.boardUsage[0]).toMatchObject({
    cards: { used: 200, limit: 200 },
    busiestCardComments: { used: 50, limit: 50 },
    commentCount: 51,
  });
  expect(
    await env.DB.prepare('SELECT COUNT(*) AS count FROM cards WHERE board_id=?')
      .bind(data.board)
      .first('count'),
  ).toBe(200);
});
