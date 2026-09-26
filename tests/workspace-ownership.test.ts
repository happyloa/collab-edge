import { env } from 'cloudflare:workers';
import { expect, it } from 'vitest';
import {
  GET,
  PATCH,
  patchFor,
} from '../app/api/workspaces/[workspaceId]/route';
import { POST as CREATE_BOARD, createBoardFor } from '../app/api/boards/route';
import { createSession } from '../src/auth/session';
import { hashPassword } from '../src/auth/crypto';

const origin = 'https://workspace.test';
const password = 'A-valid-transfer-password-2026';

async function fixture() {
  const ownerId = crypto.randomUUID();
  const recipientId = crypto.randomUUID();
  const outsiderId = crypto.randomUUID();
  const workspaceId = crypto.randomUUID();
  const hashed = await hashPassword(password);
  await env.DB.batch([
    ...[
      [ownerId, 'Owner'],
      [recipientId, 'Recipient'],
      [outsiderId, 'Outsider'],
    ].map(([id, name]) =>
      env.DB.prepare(
        'INSERT INTO users(id,email,name,password,created_at) VALUES(?,?,?,?,?)',
      ).bind(id, `${id}@example.com`, name, hashed, Date.now()),
    ),
    env.DB.prepare('INSERT INTO workspaces VALUES(?,?,?)').bind(
      workspaceId,
      'Transfer test',
      ownerId,
    ),
    env.DB.prepare('INSERT INTO workspace_members VALUES(?,?,?)').bind(
      workspaceId,
      ownerId,
      'OWNER',
    ),
    env.DB.prepare('INSERT INTO workspace_members VALUES(?,?,?)').bind(
      workspaceId,
      recipientId,
      'EDITOR',
    ),
  ]);
  const cookies = new Map<string, string>();
  for (const id of [ownerId, recipientId, outsiderId])
    cookies.set(
      id,
      (await createSession(id, new Request(origin))).split(';')[0],
    );
  const get = (userId: string) =>
    GET(
      new Request(`${origin}/api/workspaces/${workspaceId}`, {
        headers: { Cookie: cookies.get(userId)! },
      }),
    );
  const transferFor = async (userId: string) =>
    ((await (await get(userId)).json()) as { transfer: unknown }).transfer;
  const patch = (userId: string, data: object, handler = PATCH) =>
    handler(
      new Request(`${origin}/api/workspaces/${workspaceId}`, {
        method: 'PATCH',
        headers: {
          Origin: origin,
          'Content-Type': 'application/json',
          Cookie: cookies.get(userId)!,
        },
        body: JSON.stringify(data),
      }),
    );
  const createBoard = (userId: string, handler = CREATE_BOARD) =>
    handler(
      new Request(`${origin}/api/boards`, {
        method: 'POST',
        headers: {
          Origin: origin,
          'Content-Type': 'application/json',
          Cookie: cookies.get(userId)!,
        },
        body: JSON.stringify({ workspaceId, name: 'New board' }),
      }),
    );
  return {
    ownerId,
    recipientId,
    outsiderId,
    workspaceId,
    get,
    transferFor,
    patch,
    createBoard,
  };
}

function interruptWorkspaceWrite(change: (db: D1Database) => Promise<void>) {
  let interrupted = false;
  return new Proxy(env.DB, {
    get(target, property) {
      if (property === 'batch')
        return async (statements: D1PreparedStatement[]) => {
          if (!interrupted) {
            interrupted = true;
            await change(target);
          }
          return target.batch(statements);
        };
      const value: unknown = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

async function transferDuringWrite(
  binding: D1Database,
  workspaceId: string,
  fromUserId: string,
  toUserId: string,
) {
  await binding.batch([
    binding
      .prepare(
        "UPDATE workspace_members SET role='EDITOR' WHERE workspace_id=? AND user_id=?",
      )
      .bind(workspaceId, fromUserId),
    binding
      .prepare(
        "UPDATE workspace_members SET role='OWNER' WHERE workspace_id=? AND user_id=?",
      )
      .bind(workspaceId, toUserId),
    binding
      .prepare('UPDATE workspaces SET owner_id=? WHERE id=?')
      .bind(toUserId, workspaceId),
  ]);
}

it('transfers ownership only after the recipient signs in and confirms a password', async () => {
  const f = await fixture();
  expect((await f.get(f.outsiderId)).status).toBe(403);
  expect(
    (
      await f.patch(f.recipientId, {
        action: 'transfer.request',
        userId: f.outsiderId,
        password,
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await f.patch(f.ownerId, {
        action: 'transfer.request',
        userId: f.recipientId,
        password: 'wrong-password',
      })
    ).status,
  ).toBe(401);
  expect(await f.transferFor(f.ownerId)).toBeNull();
  const requested = await f.patch(f.ownerId, {
    action: 'transfer.request',
    userId: f.recipientId,
    password,
  });
  expect(requested.status).toBe(200);
  expect(await f.transferFor(f.recipientId)).toMatchObject({
    fromUserId: f.ownerId,
    toUserId: f.recipientId,
  });
  expect(
    (await f.patch(f.outsiderId, { action: 'transfer.accept', password }))
      .status,
  ).toBe(403);
  expect(
    (
      await f.patch(f.recipientId, {
        action: 'transfer.accept',
        password: 'wrong-password',
      })
    ).status,
  ).toBe(401);
  expect(
    await env.DB.prepare('SELECT owner_id FROM workspaces WHERE id=?')
      .bind(f.workspaceId)
      .first(),
  ).toMatchObject({ owner_id: f.ownerId });
  expect(
    (await f.patch(f.recipientId, { action: 'transfer.accept', password }))
      .status,
  ).toBe(200);
  expect(
    await env.DB.prepare('SELECT owner_id FROM workspaces WHERE id=?')
      .bind(f.workspaceId)
      .first(),
  ).toMatchObject({ owner_id: f.recipientId });
  const roles = await env.DB.prepare(
    'SELECT user_id,role FROM workspace_members WHERE workspace_id=? ORDER BY user_id',
  )
    .bind(f.workspaceId)
    .all<{ user_id: string; role: string }>();
  expect(roles.results).toEqual(
    expect.arrayContaining([
      { user_id: f.ownerId, role: 'EDITOR' },
      { user_id: f.recipientId, role: 'OWNER' },
    ]),
  );
  expect(await f.transferFor(f.ownerId)).toBeNull();
  expect((await f.patch(f.ownerId, { action: 'transfer.cancel' })).status).toBe(
    403,
  );
  expect((await f.patch(f.recipientId, { action: 'leave' })).status).toBe(409);
  expect((await f.patch(f.ownerId, { action: 'leave' })).status).toBe(200);
});

it('rejects expired or over-quota acceptance without partial role changes', async () => {
  const f = await fixture();
  expect(
    (
      await f.patch(f.ownerId, {
        action: 'transfer.request',
        userId: f.recipientId,
        password,
      })
    ).status,
  ).toBe(200);
  await env.DB.prepare(
    'UPDATE workspace_transfers SET expires_at=? WHERE workspace_id=?',
  )
    .bind(Date.now() - 1, f.workspaceId)
    .run();
  expect(await f.transferFor(f.recipientId)).toBeNull();
  expect(
    (await f.patch(f.recipientId, { action: 'transfer.accept', password }))
      .status,
  ).toBe(409);
  expect(
    (
      await f.patch(f.ownerId, {
        action: 'transfer.request',
        userId: f.recipientId,
        password,
      })
    ).status,
  ).toBe(200);
  await env.DB.batch(
    Array.from({ length: 3 }, () =>
      env.DB.prepare('INSERT INTO workspaces VALUES(?,?,?)').bind(
        crypto.randomUUID(),
        'Other workspace',
        f.recipientId,
      ),
    ),
  );
  expect(
    (await f.patch(f.recipientId, { action: 'transfer.accept', password }))
      .status,
  ).toBe(409);
  expect(
    await env.DB.prepare('SELECT owner_id FROM workspaces WHERE id=?')
      .bind(f.workspaceId)
      .first(),
  ).toMatchObject({ owner_id: f.ownerId });
  expect(
    await env.DB.prepare(
      'SELECT role FROM workspace_members WHERE workspace_id=? AND user_id=?',
    )
      .bind(f.workspaceId, f.recipientId)
      .first(),
  ).toMatchObject({ role: 'EDITOR' });
  await expect(
    env.DB.prepare('UPDATE workspaces SET owner_id=? WHERE id=?')
      .bind(f.recipientId, f.workspaceId)
      .run(),
  ).rejects.toThrow(/Workspace quota reached/);
});

it('still allows current owners to manage workspaces and members', async () => {
  const f = await fixture();
  expect(
    (await f.patch(f.ownerId, { action: 'rename', name: 'Current team' }))
      .status,
  ).toBe(200);
  expect(
    (
      await f.patch(f.ownerId, {
        action: 'role',
        userId: f.recipientId,
        role: 'VIEWER',
      })
    ).status,
  ).toBe(200);
  expect(
    (await f.patch(f.recipientId, { action: 'rename', name: 'No access' }))
      .status,
  ).toBe(403);
  expect(
    (
      await f.patch(f.ownerId, {
        action: 'invite',
        email: `${f.outsiderId}@example.com`,
        role: 'EDITOR',
      })
    ).status,
  ).toBe(200);
  expect(
    await env.DB.prepare('SELECT name FROM workspaces WHERE id=?')
      .bind(f.workspaceId)
      .first(),
  ).toMatchObject({ name: 'Current team' });
  expect(
    await env.DB.prepare(
      'SELECT role FROM workspace_members WHERE workspace_id=? AND user_id=?',
    )
      .bind(f.workspaceId, f.outsiderId)
      .first(),
  ).toMatchObject({ role: 'EDITOR' });
  expect(
    (await f.patch(f.ownerId, { action: 'remove', userId: f.outsiderId }))
      .status,
  ).toBe(200);
  expect((await f.patch(f.recipientId, { action: 'leave' })).status).toBe(200);
  expect(
    await env.DB.prepare(
      'SELECT 1 FROM workspace_members WHERE workspace_id=? AND user_id IN (?,?)',
    )
      .bind(f.workspaceId, f.recipientId, f.outsiderId)
      .first(),
  ).toBeNull();
});

it('rejects stale owner writes after ownership changes before the D1 transaction', async () => {
  for (const action of ['rename', 'invite', 'role', 'remove'] as const) {
    const f = await fixture();
    const data =
      action === 'rename'
        ? { action, name: 'Stale rename' }
        : action === 'invite'
          ? {
              action,
              email: `${f.outsiderId}@example.com`,
              role: 'EDITOR',
            }
          : action === 'role'
            ? { action, userId: f.recipientId, role: 'VIEWER' }
            : { action, userId: f.recipientId };
    const db = interruptWorkspaceWrite((binding) =>
      transferDuringWrite(binding, f.workspaceId, f.ownerId, f.recipientId),
    );
    const response = await f.patch(
      f.ownerId,
      data,
      patchFor({ ...env, DB: db }),
    );
    expect(response.status).toBe(409);
    expect(
      await env.DB.prepare('SELECT owner_id,name FROM workspaces WHERE id=?')
        .bind(f.workspaceId)
        .first(),
    ).toMatchObject({ owner_id: f.recipientId, name: 'Transfer test' });
    expect(
      await env.DB.prepare(
        'SELECT role FROM workspace_members WHERE workspace_id=? AND user_id=?',
      )
        .bind(f.workspaceId, f.recipientId)
        .first(),
    ).toMatchObject({ role: 'OWNER' });
    expect(
      await env.DB.prepare(
        'SELECT 1 FROM workspace_members WHERE workspace_id=? AND user_id=?',
      )
        .bind(f.workspaceId, f.outsiderId)
        .first(),
    ).toBeNull();
  }
});

it('does not let a member leave after becoming the workspace owner', async () => {
  const f = await fixture();
  const db = interruptWorkspaceWrite((binding) =>
    transferDuringWrite(binding, f.workspaceId, f.ownerId, f.recipientId),
  );
  const response = await f.patch(
    f.recipientId,
    { action: 'leave' },
    patchFor({ ...env, DB: db }),
  );
  expect(response.status).toBe(409);
  expect(
    await env.DB.prepare(
      'SELECT role FROM workspace_members WHERE workspace_id=? AND user_id=?',
    )
      .bind(f.workspaceId, f.recipientId)
      .first(),
  ).toMatchObject({ role: 'OWNER' });
});

it('rejects a transfer proposal when its password confirmation becomes stale', async () => {
  const f = await fixture();
  const db = interruptWorkspaceWrite(async (binding) => {
    await binding
      .prepare('UPDATE users SET password=? WHERE id=?')
      .bind('password-reset-before-commit', f.ownerId)
      .run();
  });
  const response = await f.patch(
    f.ownerId,
    { action: 'transfer.request', userId: f.recipientId, password },
    patchFor({ ...env, DB: db }),
  );
  expect(response.status).toBe(409);
  expect(await f.transferFor(f.ownerId)).toBeNull();
});

it('rejects transfer acceptance if its app session is revoked before commit', async () => {
  const f = await fixture();
  expect(
    (
      await f.patch(f.ownerId, {
        action: 'transfer.request',
        userId: f.recipientId,
        password,
      })
    ).status,
  ).toBe(200);
  const db = interruptWorkspaceWrite(async (binding) => {
    await binding
      .prepare('DELETE FROM sessions WHERE user_id=?')
      .bind(f.recipientId)
      .run();
  });
  const response = await f.patch(
    f.recipientId,
    { action: 'transfer.accept', password },
    patchFor({ ...env, DB: db }),
  );
  expect(response.status).toBe(409);
  expect(
    await env.DB.prepare('SELECT owner_id FROM workspaces WHERE id=?')
      .bind(f.workspaceId)
      .first(),
  ).toMatchObject({ owner_id: f.ownerId });
});

it('checks board-creation membership again inside its D1 transaction', async () => {
  const f = await fixture();
  expect((await f.createBoard(f.outsiderId)).status).toBe(403);
  const db = interruptWorkspaceWrite(async (binding) => {
    await binding
      .prepare(
        'DELETE FROM workspace_members WHERE workspace_id=? AND user_id=?',
      )
      .bind(f.workspaceId, f.recipientId)
      .run();
  });
  expect(
    (await f.createBoard(f.recipientId, createBoardFor({ ...env, DB: db })))
      .status,
  ).toBe(409);
  expect(
    await env.DB.prepare('SELECT 1 FROM boards WHERE workspace_id=?')
      .bind(f.workspaceId)
      .first(),
  ).toBeNull();
  const created = await f.createBoard(f.ownerId);
  expect(created.status).toBe(201);
  const { id } = (await created.json()) as { id: string };
  expect(
    await env.DB.prepare(
      'SELECT count(*) AS total FROM board_columns WHERE board_id=?',
    )
      .bind(id)
      .first(),
  ).toMatchObject({ total: 4 });
});
