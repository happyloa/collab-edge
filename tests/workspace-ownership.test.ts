import { env } from 'cloudflare:workers';
import { expect, it } from 'vitest';
import { GET, PATCH } from '../app/api/workspaces/[workspaceId]/route';
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
      env.DB.prepare('INSERT INTO users VALUES(?,?,?,?,?)').bind(
        id,
        `${id}@example.com`,
        name,
        hashed,
        Date.now(),
      ),
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
  const patch = (userId: string, data: object) =>
    PATCH(
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
  return {
    ownerId,
    recipientId,
    outsiderId,
    workspaceId,
    get,
    transferFor,
    patch,
  };
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
