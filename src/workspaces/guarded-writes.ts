import { AppError } from '../lib/errors';

type TargetCheck = {
  userId: string;
  membership: 'absent' | 'non-owner';
};

export function ownerWriteGuard(
  binding: D1Database,
  workspaceId: string,
  actorId: string,
  target?: TargetCheck,
) {
  const targetCheck = target
    ? target.membership === 'absent'
      ? `AND NOT EXISTS (
           SELECT 1 FROM workspace_members AS target
           WHERE target.workspace_id=w.id AND target.user_id=?
         )`
      : `AND EXISTS (
           SELECT 1 FROM workspace_members AS target
           WHERE target.workspace_id=w.id AND target.user_id=?
             AND target.role!='OWNER' AND target.user_id!=w.owner_id
         )`
    : '';
  return binding
    .prepare(
      `INSERT INTO mutation_guard(value)
       SELECT CASE WHEN EXISTS (
         SELECT 1 FROM workspaces AS w
         JOIN workspace_members AS actor
           ON actor.workspace_id=w.id AND actor.user_id=?
         WHERE w.id=? AND w.owner_id=? AND actor.role='OWNER'
           ${targetCheck}
       ) THEN 1 ELSE 0 END`,
    )
    .bind(actorId, workspaceId, actorId, ...(target ? [target.userId] : []));
}

export function leaveWriteGuard(
  binding: D1Database,
  workspaceId: string,
  userId: string,
) {
  return binding
    .prepare(
      `INSERT INTO mutation_guard(value)
       SELECT CASE WHEN EXISTS (
         SELECT 1 FROM workspaces AS w
         JOIN workspace_members AS member
           ON member.workspace_id=w.id AND member.user_id=?
         WHERE w.id=? AND w.owner_id!=? AND member.role!='OWNER'
       ) THEN 1 ELSE 0 END`,
    )
    .bind(userId, workspaceId, userId);
}

export function memberWriteGuard(
  binding: D1Database,
  workspaceId: string,
  userId: string,
) {
  return binding
    .prepare(
      `INSERT INTO mutation_guard(value)
       SELECT CASE WHEN EXISTS (
         SELECT 1 FROM workspace_members
         WHERE workspace_id=? AND user_id=? AND role IN ('OWNER','EDITOR')
       ) THEN 1 ELSE 0 END`,
    )
    .bind(workspaceId, userId);
}

export async function guardedWorkspaceWrite(
  binding: D1Database,
  guard: D1PreparedStatement,
  write: D1PreparedStatement | D1PreparedStatement[],
) {
  try {
    await binding.batch([
      guard,
      ...(Array.isArray(write) ? write : [write]),
      binding.prepare('DELETE FROM mutation_guard'),
    ]);
  } catch (error) {
    if (
      error instanceof Error &&
      /CHECK constraint failed.*(?:mutation_guard|value)/i.test(error.message)
    )
      throw new AppError(
        409,
        'Workspace membership changed. Reload and retry.',
      );
    if (error instanceof Error && /Account deleted/i.test(error.message))
      throw new AppError(409, 'This account is unavailable');
    throw error;
  }
}
