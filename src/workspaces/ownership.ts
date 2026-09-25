import { DEMO } from '../db/demo';
import { AppError, assert } from '../lib/errors';
import { LIMITS } from '../lib/limits';

export type OwnershipTransfer = {
  fromUserId: string;
  toUserId: string;
  expiresAt: number;
};

const demoUsers = new Set([DEMO.owner, DEMO.Alice, DEMO.Bob]);
const transferLifetime = 7 * 24 * 60 * 60 * 1000;

function protectDemo(
  workspaceId: string,
  fromUserId: string,
  toUserId: string,
) {
  assert(
    workspaceId !== DEMO.workspace &&
      !demoUsers.has(fromUserId) &&
      !demoUsers.has(toUserId),
    403,
    'Demo ownership cannot be transferred',
  );
}

async function guardedBatch(
  binding: D1Database,
  statements: D1PreparedStatement[],
) {
  try {
    await binding.batch(statements);
  } catch (error) {
    if (
      error instanceof Error &&
      /Workspace quota reached/i.test(error.message)
    )
      throw new AppError(
        409,
        'Recipient owns the maximum number of workspaces',
      );
    if (
      error instanceof Error &&
      /CHECK constraint failed.*(?:mutation_guard|value)/i.test(error.message)
    )
      throw new AppError(
        409,
        'Workspace membership changed. Reload and retry.',
      );
    throw error;
  }
}

export async function visibleTransfer(
  binding: D1Database,
  workspaceId: string,
  userId: string,
  role: string,
): Promise<OwnershipTransfer | null> {
  const row = await binding
    .prepare(
      'SELECT from_user_id, to_user_id, expires_at FROM workspace_transfers WHERE workspace_id=? AND expires_at>?',
    )
    .bind(workspaceId, Date.now())
    .first<{
      from_user_id: string;
      to_user_id: string;
      expires_at: number;
    }>();
  if (!row || (role !== 'OWNER' && row.to_user_id !== userId)) return null;
  return {
    fromUserId: row.from_user_id,
    toUserId: row.to_user_id,
    expiresAt: row.expires_at,
  };
}

export async function proposeTransfer(
  binding: D1Database,
  workspaceId: string,
  fromUserId: string,
  toUserId: string,
) {
  protectDemo(workspaceId, fromUserId, toUserId);
  assert(fromUserId !== toUserId, 400, 'Choose another workspace member');
  const target = await binding
    .prepare(
      'SELECT role FROM workspace_members WHERE workspace_id=? AND user_id=?',
    )
    .bind(workspaceId, toUserId)
    .first<{ role: string }>();
  assert(
    target && target.role !== 'OWNER',
    409,
    'Choose a current workspace member',
  );
  const expiresAt = Date.now() + transferLifetime;
  await guardedBatch(binding, [
    binding
      .prepare(
        `INSERT INTO mutation_guard(value)
         SELECT CASE WHEN EXISTS(
           SELECT 1 FROM workspaces AS w
           JOIN workspace_members AS source
             ON source.workspace_id=w.id AND source.user_id=w.owner_id
           JOIN workspace_members AS target
             ON target.workspace_id=w.id AND target.user_id=?
           WHERE w.id=? AND w.owner_id=? AND source.role='OWNER'
             AND target.role IN ('EDITOR','VIEWER')
         ) THEN 1 ELSE 0 END`,
      )
      .bind(toUserId, workspaceId, fromUserId),
    binding
      .prepare(
        `INSERT INTO workspace_transfers(workspace_id,from_user_id,to_user_id,expires_at)
         VALUES(?,?,?,?)
         ON CONFLICT(workspace_id) DO UPDATE SET
           from_user_id=excluded.from_user_id,
           to_user_id=excluded.to_user_id,
           expires_at=excluded.expires_at`,
      )
      .bind(workspaceId, fromUserId, toUserId, expiresAt),
    binding.prepare('DELETE FROM mutation_guard'),
  ]);
  return { fromUserId, toUserId, expiresAt } satisfies OwnershipTransfer;
}

export async function acceptTransfer(
  binding: D1Database,
  workspaceId: string,
  toUserId: string,
) {
  const proposal = await binding
    .prepare(
      'SELECT from_user_id, to_user_id, expires_at FROM workspace_transfers WHERE workspace_id=?',
    )
    .bind(workspaceId)
    .first<{
      from_user_id: string;
      to_user_id: string;
      expires_at: number;
    }>();
  assert(
    proposal &&
      proposal.to_user_id === toUserId &&
      proposal.expires_at > Date.now(),
    409,
    'Transfer request is unavailable or expired',
  );
  protectDemo(workspaceId, proposal.from_user_id, toUserId);
  const owned = await binding
    .prepare('SELECT count(*) AS total FROM workspaces WHERE owner_id=?')
    .bind(toUserId)
    .first<{ total: number }>();
  assert(
    (owned?.total ?? LIMITS.workspacesPerUser) < LIMITS.workspacesPerUser,
    409,
    'Recipient owns the maximum number of workspaces',
  );
  const fromUserId = proposal.from_user_id;
  await guardedBatch(binding, [
    binding
      .prepare(
        `INSERT INTO mutation_guard(value)
         SELECT CASE WHEN EXISTS(
           SELECT 1 FROM workspace_transfers AS transfer
           JOIN workspaces AS w ON w.id=transfer.workspace_id
           JOIN workspace_members AS source
             ON source.workspace_id=w.id AND source.user_id=transfer.from_user_id
           JOIN workspace_members AS target
             ON target.workspace_id=w.id AND target.user_id=transfer.to_user_id
           WHERE transfer.workspace_id=? AND transfer.from_user_id=?
             AND transfer.to_user_id=? AND transfer.expires_at>?
             AND w.owner_id=transfer.from_user_id AND source.role='OWNER'
             AND target.role IN ('EDITOR','VIEWER')
             AND (SELECT count(*) FROM workspaces WHERE owner_id=?)<?
         ) THEN 1 ELSE 0 END`,
      )
      .bind(
        workspaceId,
        fromUserId,
        toUserId,
        Date.now(),
        toUserId,
        LIMITS.workspacesPerUser,
      ),
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
    binding
      .prepare('DELETE FROM workspace_transfers WHERE workspace_id=?')
      .bind(workspaceId),
    binding.prepare('DELETE FROM mutation_guard'),
  ]);
}

export async function cancelTransfer(
  binding: D1Database,
  workspaceId: string,
  userId: string,
  owner: boolean,
) {
  const result = await binding
    .prepare(
      owner
        ? 'DELETE FROM workspace_transfers WHERE workspace_id=? AND from_user_id=?'
        : 'DELETE FROM workspace_transfers WHERE workspace_id=? AND to_user_id=?',
    )
    .bind(workspaceId, userId)
    .run();
  assert(result.meta.changes === 1, 404, 'No pending ownership transfer');
}
