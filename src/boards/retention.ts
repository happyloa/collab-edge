import { z } from 'zod';
import { assert, AppError } from '../lib/errors';
import { LIMITS } from '../lib/limits';
import { DEMO } from '../db/demo';
import {
  ownerWriteGuard,
  guardedWorkspaceWrite,
} from '../workspaces/guarded-writes';

export const EVENT_RETENTION = Object.freeze({
  days: 30,
  recentEvents: 200,
  batchSize: 100,
});

const historyBatch = z
  .strictObject({
    afterRevision: z.number().int().min(0).max(LIMITS.eventsPerBoard),
    throughRevision: z.number().int().min(1).max(LIMITS.eventsPerBoard),
  })
  .refine((batch) => batch.afterRevision < batch.throughRevision);
export const pruneHistorySchema = z.strictObject({
  boardId: z.uuid(),
  expectedRevision: z.number().int().min(0).max(LIMITS.eventsPerBoard),
  before: z.iso.datetime(),
  batch: historyBatch,
});
export type PruneHistoryInput = z.infer<typeof pruneHistorySchema>;
export type HistoryResult<T> =
  | { ok: true; value: T }
  | { ok: false; status: number; message: string; code: string };
export async function historyResult<T>(
  execute: () => Promise<T>,
): Promise<HistoryResult<T>> {
  try {
    return { ok: true, value: await execute() };
  } catch (error) {
    if (error instanceof AppError)
      return {
        ok: false,
        status: error.status,
        message: error.message,
        code: error.code,
      };
    if (error instanceof z.ZodError)
      return {
        ok: false,
        status: 400,
        message: 'Invalid request payload',
        code: 'INVALID_REQUEST',
      };
    throw error;
  }
}
export type HistoryRetention = {
  boardId: string;
  revision: number;
  before: string;
  eligibleEvents: number;
  eligibleBytes: number;
  prunedEvents: number;
  prunedThroughRevision: number;
  recentEvents: number;
  retentionDays: number;
  batchSize: number;
  batch: z.infer<typeof historyBatch> | null;
};

export function retentionCutoff(now = Date.now()) {
  return new Date(now - EVENT_RETENTION.days * 86400000).toISOString();
}

// Keep UUID/actor/revision receipts and all lifetime budgets. Only old payloads
// are discarded, so compaction cannot make a retry into a new mutation.
export async function previewHistory(
  db: D1Database,
  boardId: string,
  actorId: string,
  before = retentionCutoff(),
): Promise<HistoryRetention> {
  assert(boardId !== DEMO.board, 403, 'Shared demo history cannot be cleared.');
  const row = await db
    .prepare(
      `WITH authorized AS (
        SELECT b.id,b.revision,b.history_pruned_through FROM boards b
        JOIN workspaces w ON w.id=b.workspace_id
        JOIN workspace_members m ON m.workspace_id=w.id AND m.user_id=?
        WHERE b.id=? AND w.owner_id=? AND m.role='OWNER'
      ), eligible AS (
        SELECT e.revision,length(CAST(e.payload AS BLOB)) AS bytes
        FROM board_events e JOIN authorized b ON b.id=e.board_id
        WHERE e.payload_pruned=0 AND e.revision<=b.revision-? AND e.created_at<?
      ), next_batch AS (SELECT revision FROM eligible ORDER BY revision LIMIT ?)
      SELECT b.revision,b.history_pruned_through,
        (SELECT COUNT(*) FROM eligible) AS eligible_events,
        COALESCE((SELECT SUM(bytes) FROM eligible),0) AS eligible_bytes,
        (SELECT COUNT(*) FROM board_events e WHERE e.board_id=b.id AND e.payload_pruned=1) AS pruned_events,
        (SELECT MIN(revision)-1 FROM next_batch) AS after_revision,
        (SELECT MAX(revision) FROM next_batch) AS through_revision
      FROM authorized b`,
    )
    .bind(
      actorId,
      boardId,
      actorId,
      EVENT_RETENTION.recentEvents,
      before,
      EVENT_RETENTION.batchSize,
    )
    .first<{
      revision: number;
      history_pruned_through: number;
      eligible_events: number;
      eligible_bytes: number;
      pruned_events: number;
      after_revision: number | null;
      through_revision: number | null;
    }>();
  assert(row, 403, 'Only the workspace owner can manage board history.');
  return {
    boardId,
    revision: row.revision,
    before,
    eligibleEvents: row.eligible_events,
    eligibleBytes: row.eligible_bytes,
    prunedEvents: row.pruned_events,
    prunedThroughRevision: row.history_pruned_through,
    recentEvents: EVENT_RETENTION.recentEvents,
    retentionDays: EVENT_RETENTION.days,
    batchSize: EVENT_RETENTION.batchSize,
    batch:
      row.after_revision === null || row.through_revision === null
        ? null
        : {
            afterRevision: row.after_revision,
            throughRevision: row.through_revision,
          },
  };
}

export async function pruneHistory(
  db: D1Database,
  workspaceId: string,
  actorId: string,
  raw: PruneHistoryInput,
) {
  const input = pruneHistorySchema.parse(raw);
  input.before = new Date(input.before).toISOString();
  assert(
    Date.parse(input.before) <= Date.parse(retentionCutoff()),
    400,
    'The history cutoff must be at least 30 days old.',
  );
  const preview = await previewHistory(
    db,
    input.boardId,
    actorId,
    input.before,
  );
  assert(
    preview.revision === input.expectedRevision,
    409,
    'Board changed. Refresh history maintenance and review again.',
  );
  assert(
    input.batch.throughRevision <=
      input.expectedRevision - EVENT_RETENTION.recentEvents,
    400,
    'Recent history must be retained.',
  );
  const batchRows = await db
    .prepare(
      `SELECT COUNT(*) AS count FROM board_events
    WHERE board_id=? AND revision>? AND revision<=? AND created_at<?`,
    )
    .bind(
      input.boardId,
      input.batch.afterRevision,
      input.batch.throughRevision,
      input.before,
    )
    .first<{ count: number }>();
  assert(
    batchRows && batchRows.count <= EVENT_RETENTION.batchSize,
    400,
    'History maintenance batch is too large.',
  );
  await guardedWorkspaceWrite(db, ownerWriteGuard(db, workspaceId, actorId), [
    db
      .prepare(
        `INSERT INTO mutation_guard(value) SELECT CASE WHEN EXISTS (
      SELECT 1 FROM boards WHERE id=? AND workspace_id=? AND revision=?) THEN 1 ELSE 0 END`,
      )
      .bind(input.boardId, workspaceId, input.expectedRevision),
    db
      .prepare(
        `UPDATE board_events SET payload='{}',payload_pruned=1 WHERE event_id IN (
      SELECT event_id FROM board_events WHERE board_id=? AND payload_pruned=0
      AND revision>? AND revision<=? AND created_at<? ORDER BY revision LIMIT ?)`,
      )
      .bind(
        input.boardId,
        input.batch.afterRevision,
        input.batch.throughRevision,
        input.before,
        EVENT_RETENTION.batchSize,
      ),
    db
      .prepare(
        `UPDATE boards SET history_pruned_through=COALESCE((SELECT MAX(revision)
      FROM board_events WHERE board_id=? AND payload_pruned=1),history_pruned_through) WHERE id=?`,
      )
      .bind(input.boardId, input.boardId),
  ]);
  return previewHistory(db, input.boardId, actorId, input.before);
}
