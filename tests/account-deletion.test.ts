import { env } from 'cloudflare:workers';
import { expect, it } from 'vitest';
import { authenticate, deleteAccountFor, session } from '../src/auth/routes';
import { loadSnapshot } from '../src/db/queries/snapshot';
import { DEMO, seedDemo } from '../src/db/demo';
import { createSession } from '../src/auth/session';
import { hashPassword } from '../src/auth/crypto';

const origin = 'https://account.test';
const password = 'A-valid-account-password-2026';

const request = (
  path: string,
  method: 'POST' | 'DELETE',
  data: object,
  cookie = '',
) =>
  new Request(`${origin}${path}`, {
    method,
    headers: {
      Origin: origin,
      'Content-Type': 'application/json',
      Cookie: cookie,
    },
    body: JSON.stringify(data),
  });

async function register(name: string) {
  const email = `${crypto.randomUUID()}@example.com`;
  const response = await authenticate(true)(
    request('/api/auth/register', 'POST', { email, name, password }),
  );
  expect(response.status).toBe(201);
  const user = (await response.json()) as { user: { id: string } };
  return {
    id: user.user.id,
    email,
    cookie: response.headers.get('set-cookie')!.split(';')[0],
  };
}

const remove = (cookie: string, passwordValue = password, confirm = true) =>
  deleteAccountFor()(
    request(
      '/api/auth/account',
      'DELETE',
      { password: passwordValue, confirm },
      cookie,
    ),
  );

function interruptDeletion(change: (db: D1Database) => Promise<unknown>) {
  return new Proxy(env.DB, {
    get(target, property) {
      if (property === 'batch')
        return async (statements: D1PreparedStatement[]) => {
          await change(target);
          return target.batch(statements);
        };
      const value: unknown = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

it('does not allow seeded demo identities to delete their accounts', async () => {
  await seedDemo(env.DB);
  const cookie = (await createSession(DEMO.Alice, new Request(origin))).split(
    ';',
  )[0];
  expect((await remove(cookie)).status).toBe(403);
  expect(
    await (
      await session(
        new Request(`${origin}/api/auth/session`, {
          headers: { Cookie: cookie },
        }),
      )
    ).json(),
  ).toMatchObject({ canDeleteAccount: false });
});

it('requires confirmation and refuses to delete a workspace owner', async () => {
  const owner = await register('Workspace owner');
  const workspaceId = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO workspaces(id,name,owner_id) VALUES(?,?,?)',
    ).bind(workspaceId, 'Keep this workspace', owner.id),
    env.DB.prepare(
      "INSERT INTO workspace_members(workspace_id,user_id,role) VALUES(?,?,'OWNER')",
    ).bind(workspaceId, owner.id),
  ]);

  expect((await remove(owner.cookie, password, false)).status).toBe(400);
  expect((await remove(owner.cookie, 'wrong-password')).status).toBe(401);
  const blocked = await remove(owner.cookie);
  expect(blocked.status).toBe(409);
  expect(await blocked.json()).toEqual({
    error: 'Transfer ownership of your workspaces before deleting your account',
  });
  expect(
    await env.DB.prepare('SELECT email,deleted_at FROM users WHERE id=?')
      .bind(owner.id)
      .first(),
  ).toMatchObject({ email: owner.email, deleted_at: null });
  expect(
    await env.DB.prepare('SELECT id FROM sessions WHERE user_id=?')
      .bind(owner.id)
      .first(),
  ).not.toBeNull();
});

it('rejects deletion if a password reset or session revocation wins the race', async () => {
  for (const changed of ['password', 'session'] as const) {
    const account = await register(`Race ${changed}`);
    const replacement = await hashPassword('A-new-account-password-2026');
    const db = interruptDeletion(async (binding) => {
      if (changed === 'password')
        await binding
          .prepare('UPDATE users SET password=? WHERE id=?')
          .bind(replacement, account.id)
          .run();
      else
        await binding
          .prepare('DELETE FROM sessions WHERE user_id=?')
          .bind(account.id)
          .run();
    });
    const response = await deleteAccountFor({ ...env, DB: db })(
      request(
        '/api/auth/account',
        'DELETE',
        { password, confirm: true },
        account.cookie,
      ),
    );
    expect(response.status).toBe(409);
    expect(
      await env.DB.prepare('SELECT email,deleted_at FROM users WHERE id=?')
        .bind(account.id)
        .first(),
    ).toMatchObject({ email: account.email, deleted_at: null });
  }
});

it('anonymizes a member, revokes sessions, and keeps shared board history usable', async () => {
  const owner = await register('Owner');
  const member = await register('Former member');
  const workspaceId = crypto.randomUUID();
  const boardId = crypto.randomUUID();
  const columnId = crypto.randomUUID();
  const cardId = crypto.randomUUID();
  const commentId = crypto.randomUUID();
  const attachmentId = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO workspaces(id,name,owner_id) VALUES(?,?,?)',
    ).bind(workspaceId, 'Shared project', owner.id),
    env.DB.prepare(
      "INSERT INTO workspace_members(workspace_id,user_id,role) VALUES(?,?,'OWNER')",
    ).bind(workspaceId, owner.id),
    env.DB.prepare(
      "INSERT INTO workspace_members(workspace_id,user_id,role) VALUES(?,?,'EDITOR')",
    ).bind(workspaceId, member.id),
    env.DB.prepare(
      'INSERT INTO workspace_transfers(workspace_id,from_user_id,to_user_id,expires_at) VALUES(?,?,?,?)',
    ).bind(workspaceId, owner.id, member.id, Date.now() + 86_400_000),
    env.DB.prepare(
      'INSERT INTO boards(id,workspace_id,name) VALUES(?,?,?)',
    ).bind(boardId, workspaceId, 'Project board'),
    env.DB.prepare(
      'INSERT INTO board_columns(id,board_id,title,position,updated_revision,title_revision) VALUES(?,?,?,?,?,?)',
    ).bind(columnId, boardId, 'Backlog', 0, 0, 0),
    env.DB.prepare(
      'INSERT INTO cards(id,board_id,column_id,title,position,updated_revision,title_revision,description_revision) VALUES(?,?,?,?,?,?,?,?)',
    ).bind(cardId, boardId, columnId, 'Shared card', 0, 0, 0, 0),
    env.DB.prepare(
      'INSERT INTO card_comments(id,card_id,board_id,actor_id,body,created_at) VALUES(?,?,?,?,?,?)',
    ).bind(
      commentId,
      cardId,
      boardId,
      member.id,
      'Keep this note',
      new Date().toISOString(),
    ),
    env.DB.prepare(
      'INSERT INTO attachments(id,card_id,board_id,object_key,filename,mime,size,actor_id,created_at) VALUES(?,?,?,?,?,?,?,?,?)',
    ).bind(
      attachmentId,
      cardId,
      boardId,
      `${boardId}/${attachmentId}`,
      'shared.txt',
      'text/plain',
      6,
      member.id,
      new Date().toISOString(),
    ),
  ]);

  const deleted = await remove(member.cookie);
  expect(deleted.status).toBe(200);
  expect(deleted.headers.get('set-cookie')).toContain('Max-Age=0');
  const user = await env.DB.prepare(
    'SELECT email,name,password,created_at,deleted_at FROM users WHERE id=?',
  )
    .bind(member.id)
    .first<{
      email: string;
      name: string;
      password: string;
      created_at: number;
      deleted_at: number | null;
    }>();
  expect(user).toMatchObject({
    name: 'Deleted account',
    password: 'disabled-deleted-account-login',
    created_at: 0,
  });
  expect(user?.email).not.toBe(member.email);
  expect(user?.deleted_at).toBeTypeOf('number');
  expect(
    await env.DB.prepare('SELECT id FROM sessions WHERE user_id=?')
      .bind(member.id)
      .first(),
  ).toBeNull();
  expect(
    await env.DB.prepare('SELECT role FROM workspace_members WHERE user_id=?')
      .bind(member.id)
      .first(),
  ).toBeNull();
  expect(
    await env.DB.prepare(
      'SELECT workspace_id FROM workspace_transfers WHERE to_user_id=?',
    )
      .bind(member.id)
      .first(),
  ).toBeNull();
  expect(
    await (
      await session(
        new Request(`${origin}/api/auth/session`, {
          headers: { Cookie: member.cookie },
        }),
      )
    ).json(),
  ).toEqual({ user: null });
  expect(
    (
      await authenticate(false)(
        request('/api/auth/login', 'POST', {
          email: member.email,
          password,
        }),
      )
    ).status,
  ).toBe(401);

  const snapshot = await loadSnapshot(env.DB, boardId);
  expect(snapshot.comments).toMatchObject([
    { id: commentId, actorId: member.id, body: 'Keep this note' },
  ]);
  expect(snapshot.attachments).toMatchObject([
    { id: attachmentId, actorId: member.id, filename: 'shared.txt' },
  ]);
  await expect(
    env.DB.prepare('INSERT INTO sessions(id,user_id,expires_at) VALUES(?,?,?)')
      .bind(crypto.randomUUID(), member.id, Date.now() + 1000)
      .run(),
  ).rejects.toThrow(/Account deleted/);
  await expect(
    env.DB.prepare("UPDATE users SET name='Restored' WHERE id=?")
      .bind(member.id)
      .run(),
  ).rejects.toThrow(/Account deleted/);
  await expect(
    env.DB.prepare(
      "INSERT INTO workspace_members(workspace_id,user_id,role) VALUES(?,?,'EDITOR')",
    )
      .bind(workspaceId, member.id)
      .run(),
  ).rejects.toThrow(/Account deleted/);
  expect((await remove(member.cookie)).status).toBe(401);
});
