import { z } from 'zod';
import { assert, AppError } from '../lib/errors';
import {
  ownerWriteGuard,
  guardedWorkspaceWrite,
} from '../workspaces/guarded-writes';
import { BACKUP_LIMITS, canonicalJson } from './format';
import {
  startRestoreSchema,
  restoreHeaderSchema,
  provenRowSchema,
  verifyProof,
  itemCount,
  expectedKind,
  type RestoreHeader,
} from './transfer';

type Job = {
  id: string;
  workspace_id: string;
  actor_id: string;
  target_board_id: string;
  root: string;
  header: string;
  assignees: string;
  state: 'uploading' | 'complete' | 'cancelled';
  item_count: number;
  received_count: number;
  byte_count: number;
  expires_at: number;
  created_at: number;
};
export type RestoreStatus = {
  id: string;
  workspaceId: string;
  boardId: string;
  root: string;
  state: Job['state'];
  expected: number;
  received: number;
  stagedBytes: number;
  expiresAt: number;
  canResume: boolean;
  header: RestoreHeader;
};
const ownsWorkspace = `EXISTS(SELECT 1 FROM workspaces w JOIN workspace_members m
  ON m.workspace_id=w.id AND m.user_id=? WHERE w.id=? AND w.owner_id=? AND m.role='OWNER')`;
function status(job: Job, actorId: string): RestoreStatus {
  return {
    id: job.id,
    workspaceId: job.workspace_id,
    boardId: job.target_board_id,
    root: job.root,
    state: job.state,
    expected: job.item_count,
    received: job.received_count,
    stagedBytes: job.byte_count,
    expiresAt: job.expires_at,
    canResume:
      job.actor_id === actorId &&
      job.state === 'uploading' &&
      job.expires_at > Date.now(),
    header: restoreHeaderSchema.parse(JSON.parse(job.header)),
  };
}
export async function authorizedRestoreJob(
  db: D1Database,
  jobId: string,
  actorId: string,
) {
  z.uuid().parse(jobId);
  z.uuid().parse(actorId);
  const job = await db
    .prepare(
      `SELECT j.* FROM board_restore_jobs j
    JOIN workspaces w ON w.id=j.workspace_id
    JOIN workspace_members m ON m.workspace_id=w.id AND m.user_id=?
    WHERE j.id=? AND w.owner_id=? AND m.role='OWNER'`,
    )
    .bind(actorId, jobId, actorId)
    .first<Job>();
  assert(job, 403, 'Restore access denied');
  return job;
}
export async function restoreStatus(
  db: D1Database,
  jobId: string,
  actorId: string,
) {
  return status(await authorizedRestoreJob(db, jobId, actorId), actorId);
}
export async function workspaceRestoreStatus(
  db: D1Database,
  workspaceId: string,
  actorId: string,
) {
  const [owner, jobs] = await db.batch([
    db
      .prepare(`SELECT 1 AS allowed WHERE ${ownsWorkspace}`)
      .bind(actorId, workspaceId, actorId),
    db
      .prepare(
        `SELECT * FROM board_restore_jobs WHERE workspace_id=?
      AND (state='uploading' OR byte_count>0) AND ${ownsWorkspace} ORDER BY created_at DESC LIMIT 1`,
      )
      .bind(workspaceId, actorId, workspaceId, actorId),
  ]);
  assert(owner.results.length, 403, 'Restore access denied');
  return jobs.results.length ? status(jobs.results[0] as Job, actorId) : null;
}
function uploadAllowed(job: Job, actorId: string) {
  assert(job.actor_id === actorId, 403, 'Restore belongs to another account');
  assert(
    job.state === 'uploading',
    409,
    'Restore is no longer accepting uploads',
  );
  assert(job.expires_at > Date.now(), 410, 'Restore upload expired');
}
function writeGuard(db: D1Database, job: Job, actorId: string) {
  return db
    .prepare(
      `INSERT INTO mutation_guard(value) SELECT CASE WHEN
    ${ownsWorkspace} AND EXISTS(SELECT 1 FROM board_restore_jobs WHERE id=? AND state='uploading'
    AND actor_id=? AND expires_at>? AND root=? AND received_count=?) THEN 1 ELSE 0 END`,
    )
    .bind(
      actorId,
      job.workspace_id,
      actorId,
      job.id,
      actorId,
      Date.now(),
      job.root,
      job.received_count,
    );
}
export function restoreError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof z.ZodError)
    return new AppError(400, 'Invalid backup payload');
  const message = error instanceof Error ? error.message : '';
  if (/exceeded D1.*daily (row read|row write) limit/i.test(message))
    return new AppError(
      429,
      'Database daily capacity reached. Try again tomorrow.',
      'USAGE_LIMIT',
    );
  if (/(quota|budget|capacity|limit) reached/i.test(message))
    return new AppError(
      429,
      'Restore capacity reached. Keep the backup and try again later.',
      'USAGE_LIMIT',
    );
  if (/UNIQUE constraint failed.*restore_staging_slot/i.test(message))
    return new AppError(
      409,
      'Another restore needs to finish or be cleaned up first.',
    );
  if (
    /CHECK constraint failed.*(?:mutation_guard|value)|Restore is unavailable/i.test(
      message,
    )
  )
    return new AppError(409, 'Restore state or workspace ownership changed.');
  if (/UNIQUE constraint failed.*board_restore_items/i.test(message))
    return new AppError(409, 'Backup contains duplicate IDs');
  if (/CHECK constraint failed.*restore_(received|byte)_bounds/i.test(message))
    return new AppError(
      429,
      'Restore capacity reached. Keep the backup and try again later.',
      'USAGE_LIMIT',
    );
  return new AppError(500, 'Restore failed. Keep the backup and try again.');
}
export type RestoreResult<T> =
  | { ok: true; value: T }
  | { ok: false; status: number; message: string; code: string };
export async function restoreResult<T>(
  fn: () => Promise<T>,
): Promise<RestoreResult<T>> {
  try {
    return { ok: true, value: await fn() };
  } catch (error) {
    const failure = restoreError(error);
    return {
      ok: false,
      status: failure.status,
      message: failure.message,
      code: failure.code,
    };
  }
}

export async function startRestore(
  db: D1Database,
  workspaceId: string,
  actorId: string,
  input: unknown,
) {
  const data = startRestoreSchema.parse(input);
  assert(
    await verifyProof(
      data.root,
      0,
      itemCount(data.header) + 1,
      data.header,
      data.proof,
    ),
    400,
    'Backup transfer proof does not match',
  );
  // The caller's header is bounded. Each later record must prove membership in
  // this exact tree; an interrupted upload cannot silently switch source files.
  const existing = await db
    .prepare('SELECT id FROM board_restore_jobs WHERE id=?')
    .bind(data.jobId)
    .first();
  if (existing) {
    const job = await authorizedRestoreJob(db, data.jobId, actorId);
    assert(
      job.actor_id === actorId &&
        job.workspace_id === workspaceId &&
        job.root === data.root &&
        job.header === canonicalJson(data.header) &&
        job.assignees === canonicalJson(data.assignees),
      409,
      'Restore source or account changed',
    );
    return status(job, actorId);
  }
  const now = Date.now();
  try {
    // Expiry cleanup is bounded and commits independently of starting the new
    // job. A held global slot can therefore drain over explicit retries without
    // rolling cleanup back when the following INSERT still hits that slot.
    await guardedWorkspaceWrite(db, ownerWriteGuard(db, workspaceId, actorId), [
      db
        .prepare(
          `DELETE FROM board_restore_items WHERE (job_id,ordinal) IN(
        SELECT i.job_id,i.ordinal FROM board_restore_items i JOIN board_restore_jobs j ON j.id=i.job_id
        WHERE j.expires_at<=? ORDER BY i.job_id,i.ordinal LIMIT 500)`,
        )
        .bind(now),
      db
        .prepare(
          "DELETE FROM board_restore_jobs WHERE state!='complete' AND expires_at<=? AND byte_count=0",
        )
        .bind(now),
    ]);
    await guardedWorkspaceWrite(db, ownerWriteGuard(db, workspaceId, actorId), [
      db
        .prepare(
          `INSERT INTO board_restore_jobs(id,workspace_id,actor_id,target_board_id,root,header,assignees,item_count,expires_at,created_at)
        VALUES(?,?,?,?,?,?,?,?,?,?)`,
        )
        .bind(
          data.jobId,
          workspaceId,
          actorId,
          crypto.randomUUID(),
          data.root,
          canonicalJson(data.header),
          canonicalJson(data.assignees),
          itemCount(data.header),
          now + BACKUP_LIMITS.ttlMs,
          now,
        ),
    ]);
  } catch (error) {
    throw restoreError(error);
  }
  return restoreStatus(db, data.jobId, actorId);
}

export async function stageRestore(
  db: D1Database,
  jobId: string,
  actorId: string,
  input: unknown,
) {
  const items = z
    .array(provenRowSchema)
    .min(1)
    .max(BACKUP_LIMITS.chunkItems)
    .parse(input);
  const job = await authorizedRestoreJob(db, jobId, actorId);
  uploadAllowed(job, actorId);
  const header = restoreHeaderSchema.parse(JSON.parse(job.header));
  const freshIndices = [...new Set(items.map((item) => item.index))]
    .filter((index) => index > job.received_count)
    .sort((a, b) => a - b);
  assert(
    freshIndices.every(
      (index, offset) => index === job.received_count + offset + 1,
    ),
    400,
    'Upload backup records in order',
  );
  const newRows = [];
  for (const item of items) {
    const record = item.row;
    if (record.kind === 'column' || record.kind === 'card') {
      const entity = record.payload;
      assert(
        entity.updatedRevision <= header.sourceRevision &&
          entity.titleRevision <= entity.updatedRevision,
        400,
        'Backup contains invalid revisions',
      );
      if (record.kind === 'card')
        assert(
          [
            record.payload.descriptionRevision,
            record.payload.assigneeRevision,
            record.payload.dueDateRevision,
          ].every((revision) => revision <= record.payload.updatedRevision),
          400,
          'Backup contains invalid revisions',
        );
    }
    assert(
      item.row.kind === expectedKind(header, item.index) &&
        item.row.payload.boardId === header.sourceBoardId,
      400,
      'Backup contains broken relationships',
    );
    assert(
      await verifyProof(
        job.root,
        item.index,
        job.item_count + 1,
        item.row,
        item.proof,
      ),
      400,
      'Backup transfer proof does not match',
    );
    newRows.push({
      index: item.index,
      kind: item.row.kind,
      sourceId: item.row.payload.id,
      payload: canonicalJson(item.row.payload),
    });
  }
  const encoded = JSON.stringify(newRows);
  try {
    await db.batch([
      writeGuard(db, job, actorId),
      db
        .prepare(
          `INSERT INTO mutation_guard(value) SELECT CASE WHEN NOT EXISTS(
        SELECT 1 FROM json_each(?) incoming JOIN board_restore_items prior
        ON prior.job_id=? AND prior.kind=json_extract(incoming.value,'$.kind')
        AND prior.source_id=json_extract(incoming.value,'$.sourceId')
        WHERE prior.ordinal!=json_extract(incoming.value,'$.index') OR prior.payload!=json_extract(incoming.value,'$.payload')
      ) THEN 1 ELSE 0 END`,
        )
        .bind(encoded, jobId),
      ...newRows.map((row) =>
        db
          .prepare(
            `INSERT INTO board_restore_items(job_id,kind,source_id,new_id,ordinal,payload)
        VALUES(?,?,?,?,?,?) ON CONFLICT(job_id,kind,source_id) DO NOTHING`,
          )
          .bind(
            jobId,
            row.kind,
            row.sourceId,
            crypto.randomUUID(),
            row.index,
            row.payload,
          ),
      ),
      db.prepare('DELETE FROM mutation_guard'),
    ]);
  } catch (error) {
    throw restoreError(error);
  }
  return restoreStatus(db, jobId, actorId);
}

export async function completeRestore(
  db: D1Database,
  jobId: string,
  actorId: string,
) {
  const job = await authorizedRestoreJob(db, jobId, actorId);
  assert(job.actor_id === actorId, 403, 'Restore belongs to another account');
  if (job.state === 'complete') return status(job, actorId);
  uploadAllowed(job, actorId);
  assert(
    job.received_count === job.item_count,
    409,
    'Backup upload is incomplete',
  );
  const header = restoreHeaderSchema.parse(JSON.parse(job.header));
  // All entities, revision one and the compact import event commit together.
  // A new board has no pre-import client state; initial connections always get
  // its complete snapshot. Old history and mutation UUIDs are not replayed.
  const payload = JSON.stringify({
    board: { name: header.name, archived: header.archived, nameRevision: 1 },
  });
  try {
    await db.batch([
      writeGuard(db, job, actorId),
      db
        .prepare(
          `INSERT INTO mutation_guard(value) SELECT CASE WHEN
        (SELECT received_count=item_count FROM board_restore_jobs WHERE id=?)
        AND NOT EXISTS(SELECT 1 FROM board_restore_items child LEFT JOIN board_restore_items parent
          ON parent.job_id=child.job_id AND parent.kind=CASE child.kind WHEN 'card' THEN 'column' ELSE 'card' END
          AND parent.source_id=json_extract(child.payload,CASE child.kind WHEN 'card' THEN '$.columnId' ELSE '$.cardId' END)
          WHERE child.job_id=? AND child.kind!='column' AND parent.source_id IS NULL)
        AND NOT EXISTS(SELECT 1 FROM board_restore_items WHERE job_id=? AND kind IN('comment','attachment')
          GROUP BY kind,json_extract(payload,'$.cardId') HAVING COUNT(*) > CASE kind WHEN 'comment' THEN 50 ELSE 10 END)
        AND NOT EXISTS(SELECT 1 FROM json_each(?) mapping WHERE mapping.value IS NOT NULL AND NOT EXISTS(
          SELECT 1 FROM workspace_members m JOIN users u ON u.id=m.user_id
          WHERE m.workspace_id=? AND m.user_id=mapping.value AND u.deleted_at IS NULL))
        THEN 1 ELSE 0 END`,
        )
        .bind(jobId, jobId, jobId, job.assignees, job.workspace_id),
      db
        .prepare(
          'INSERT INTO boards(id,workspace_id,name,revision,name_revision,archived) VALUES(?,?,?,1,1,?)',
        )
        .bind(
          job.target_board_id,
          job.workspace_id,
          header.name,
          Number(header.archived),
        ),
      db
        .prepare(
          `INSERT INTO board_columns(id,board_id,title,position,updated_revision,title_revision)
        SELECT new_id,?,json_extract(payload,'$.title'),ROW_NUMBER() OVER(ORDER BY CAST(json_extract(payload,'$.position') AS INTEGER),source_id)-1,1,1
        FROM board_restore_items WHERE job_id=? AND kind='column'`,
        )
        .bind(job.target_board_id, jobId),
      db
        .prepare(
          `INSERT INTO cards(id,board_id,column_id,title,description,position,archived,updated_revision,title_revision,description_revision,assignee_id,due_date,assignee_revision,due_date_revision)
        SELECT card.new_id,?,col.new_id,json_extract(card.payload,'$.title'),json_extract(card.payload,'$.description'),
          ROW_NUMBER() OVER(PARTITION BY col.new_id ORDER BY CAST(json_extract(card.payload,'$.position') AS INTEGER),card.source_id)-1,
          json_extract(card.payload,'$.archived'),1,1,1,mapping.value,json_extract(card.payload,'$.dueDate'),1,1
        FROM board_restore_items card JOIN board_restore_items col ON col.job_id=card.job_id AND col.kind='column'
          AND col.source_id=json_extract(card.payload,'$.columnId')
        LEFT JOIN json_each(?) mapping ON mapping.key=json_extract(card.payload,'$.assigneeId')
        WHERE card.job_id=? AND card.kind='card'`,
        )
        .bind(job.target_board_id, job.assignees, jobId),
      db
        .prepare(
          `INSERT INTO card_comments(id,card_id,board_id,actor_id,body,created_at,imported_author_name)
        SELECT comment.new_id,card.new_id,?,?,json_extract(comment.payload,'$.body'),json_extract(comment.payload,'$.createdAt'),
          COALESCE(json_extract(comment.payload,'$.importedAuthorName'),json_extract(person.value,'$.name'),json_extract(comment.payload,'$.actorId'))
        FROM board_restore_items comment JOIN board_restore_items card ON card.job_id=comment.job_id AND card.kind='card'
          AND card.source_id=json_extract(comment.payload,'$.cardId')
        LEFT JOIN json_each(?) person ON json_extract(person.value,'$.id')=json_extract(comment.payload,'$.actorId')
        WHERE comment.job_id=? AND comment.kind='comment'`,
        )
        .bind(
          job.target_board_id,
          actorId,
          JSON.stringify(header.people),
          jobId,
        ),
      db
        .prepare(
          `INSERT INTO attachment_references(id,card_id,board_id,filename,mime,size,actor_id,created_at)
        SELECT ref.new_id,card.new_id,?,json_extract(ref.payload,'$.filename'),json_extract(ref.payload,'$.mime'),
          json_extract(ref.payload,'$.size'),?,json_extract(ref.payload,'$.createdAt')
        FROM board_restore_items ref JOIN board_restore_items card ON card.job_id=ref.job_id AND card.kind='card'
          AND card.source_id=json_extract(ref.payload,'$.cardId') WHERE ref.job_id=? AND ref.kind='attachment'`,
        )
        .bind(job.target_board_id, actorId, jobId),
      db
        .prepare('INSERT INTO board_events VALUES(?,?,?,?,?,?,?,?)')
        .bind(
          crypto.randomUUID(),
          job.target_board_id,
          1,
          job.id,
          actorId,
          'board.import',
          payload,
          new Date().toISOString(),
        ),
      db
        .prepare("UPDATE board_restore_jobs SET state='complete' WHERE id=?")
        .bind(jobId),
      db.prepare('DELETE FROM mutation_guard'),
    ]);
  } catch (error) {
    throw restoreError(error);
  }
  return restoreStatus(db, jobId, actorId);
}

export async function cancelRestore(
  db: D1Database,
  jobId: string,
  actorId: string,
) {
  const job = await authorizedRestoreJob(db, jobId, actorId);
  assert(
    job.state !== 'complete',
    409,
    'A completed restore cannot be cancelled',
  );
  try {
    await guardedWorkspaceWrite(
      db,
      ownerWriteGuard(db, job.workspace_id, actorId),
      [
        db
          .prepare(
            "INSERT INTO mutation_guard(value) SELECT CASE WHEN EXISTS(SELECT 1 FROM board_restore_jobs WHERE id=? AND state!='complete') THEN 1 ELSE 0 END",
          )
          .bind(jobId),
        db
          .prepare("UPDATE board_restore_jobs SET state='cancelled' WHERE id=?")
          .bind(jobId),
      ],
    );
  } catch (error) {
    throw restoreError(error);
  }
  return restoreStatus(db, jobId, actorId);
}
export async function cleanRestore(
  db: D1Database,
  jobId: string,
  actorId: string,
) {
  const job = await authorizedRestoreJob(db, jobId, actorId);
  assert(
    job.state !== 'uploading',
    409,
    'Finish or cancel the restore before cleanup',
  );
  try {
    await guardedWorkspaceWrite(
      db,
      ownerWriteGuard(db, job.workspace_id, actorId),
      [
        db
          .prepare(
            "INSERT INTO mutation_guard(value) SELECT CASE WHEN EXISTS(SELECT 1 FROM board_restore_jobs WHERE id=? AND state!='uploading') THEN 1 ELSE 0 END",
          )
          .bind(jobId),
        db
          .prepare(
            'DELETE FROM board_restore_items WHERE job_id=? AND ordinal IN(SELECT ordinal FROM board_restore_items WHERE job_id=? ORDER BY ordinal LIMIT 500)',
          )
          .bind(jobId, jobId),
        db
          .prepare(
            "DELETE FROM board_restore_jobs WHERE id=? AND state='cancelled' AND byte_count=0",
          )
          .bind(jobId),
      ],
    );
  } catch (error) {
    throw restoreError(error);
  }
  const remaining = await db
    .prepare('SELECT byte_count FROM board_restore_jobs WHERE id=?')
    .bind(jobId)
    .first<{ byte_count: number }>();
  return { done: !remaining || remaining.byte_count === 0 };
}
