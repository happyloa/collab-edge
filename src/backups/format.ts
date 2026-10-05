import { z } from 'zod';
import { snapshotSchema, type Snapshot } from '../realtime/protocol';
import { LIMITS } from '../lib/limits';
import { assert } from '../lib/errors';

export const BACKUP_LIMITS = Object.freeze({
  fileBytes: 96 * 1024 * 1024,
  stagedBytes: 80 * 1024 * 1024,
  retainedBytes: 64 * 1024 * 1024,
  items:
    1 +
    LIMITS.columnsPerBoard +
    LIMITS.cardsPerBoard +
    LIMITS.cardsPerBoard * (LIMITS.commentsPerCard + LIMITS.attachmentsPerCard),
  ttlMs: 7 * 24 * 60 * 60 * 1000,
  chunkItems: 30,
});
export const peopleSchema = z
  .array(z.object({ id: z.uuid(), name: z.string().min(1).max(80) }).strict())
  .max(LIMITS.membersPerWorkspace)
  .refine(
    (people) =>
      new Set(people.map((person) => person.id)).size === people.length,
  );
const safeRevision = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const safePosition = z
  .number()
  .int()
  .min(Number.MIN_SAFE_INTEGER)
  .max(Number.MAX_SAFE_INTEGER);
const title = z.string().min(1).max(160);
const timestamp = z.iso.datetime({ offset: true });
export const backupColumn = snapshotSchema.shape.columns.element
  .extend({
    title,
    position: safePosition,
    updatedRevision: safeRevision,
    titleRevision: safeRevision,
  })
  .strict();
export const backupCard = snapshotSchema.shape.cards.element
  .extend({
    title,
    description: z.string().max(10000),
    position: safePosition,
    updatedRevision: safeRevision,
    titleRevision: safeRevision,
    descriptionRevision: safeRevision,
    assigneeRevision: safeRevision,
    dueDateRevision: safeRevision,
  })
  .strict();
export const backupComment = snapshotSchema.shape.comments.element
  .extend({
    body: z
      .string()
      .min(1)
      .max(2000)
      .refine((value) => value.trim().length > 0),
    createdAt: timestamp,
  })
  .strict();
export const backupAttachment = snapshotSchema.shape.attachments.element
  .extend({
    filename: z.string().min(1).max(180),
    mime: z.string().min(1).max(128),
    size: z.number().int().min(1).max(LIMITS.attachmentBytes),
    createdAt: timestamp,
  })
  .strict();
export const backupSnapshot = snapshotSchema
  .extend({
    board: snapshotSchema.shape.board
      .extend({
        name: title,
        revision: safeRevision,
        nameRevision: safeRevision,
      })
      .strict(),
    columns: z.array(backupColumn).max(LIMITS.columnsPerBoard),
    cards: z.array(backupCard).max(LIMITS.cardsPerBoard),
    comments: z
      .array(backupComment)
      .max(LIMITS.cardsPerBoard * LIMITS.commentsPerCard),
    attachments: z
      .array(backupAttachment)
      .max(LIMITS.cardsPerBoard * LIMITS.attachmentsPerCard),
    attachmentReferences: z
      .array(backupAttachment)
      .max(LIMITS.cardsPerBoard * LIMITS.attachmentsPerCard)
      .optional(),
  })
  .strict();
const common = {
  exportedAt: timestamp,
  snapshot: backupSnapshot,
  people: peopleSchema,
  attachmentContentsIncluded: z.literal(false),
};
export const boardBackupSchema = z.discriminatedUnion('format', [
  z.object({ format: z.literal('collabedge.board.v1'), ...common }).strict(),
  z
    .object({
      format: z.literal('collabedge.board.v2'),
      ...common,
      checksum: z
        .object({
          algorithm: z.literal('SHA-256'),
          value: z.string().regex(/^[a-f0-9]{64}$/),
        })
        .strict(),
    })
    .strict(),
]);
export type BoardBackup = z.infer<typeof boardBackupSchema>;

// Stable object-key order makes checksums independent of JSON whitespace.
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value))
    return '[' + value.map(canonicalJson).join(',') + ']';
  if (value !== null && typeof value === 'object')
    return (
      '{' +
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, item]) => JSON.stringify(key) + ':' + canonicalJson(item))
        .join(',') +
      '}'
    );
  const result = JSON.stringify(value);
  if (result === undefined) throw new Error('Unsupported backup value');
  return result;
}
export async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  return Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
    (item) => item.toString(16).padStart(2, '0'),
  ).join('');
}
function unique(items: { id: string }[]) {
  assert(
    new Set(items.map((item) => item.id)).size === items.length,
    400,
    'Backup contains duplicate IDs',
  );
}
export function validateBackupRelations(backup: BoardBackup) {
  const { snapshot, people } = backup;
  const references = snapshot.attachmentReferences ?? [];
  for (const items of [
    people,
    snapshot.columns,
    snapshot.cards,
    snapshot.comments,
    [...snapshot.attachments, ...references],
  ])
    unique(items);
  assert(
    snapshot.board.nameRevision <= snapshot.board.revision,
    400,
    'Backup contains invalid revisions',
  );
  const columns = new Set(snapshot.columns.map((item) => item.id));
  const cards = new Set(snapshot.cards.map((item) => item.id));
  const comments = new Map<string, number>(),
    attachments = new Map<string, number>();
  for (const item of [
    ...snapshot.columns,
    ...snapshot.cards,
    ...snapshot.comments,
    ...snapshot.attachments,
    ...references,
  ])
    assert(
      item.boardId === snapshot.board.id,
      400,
      'Backup contains broken relationships',
    );
  for (const item of snapshot.columns)
    assert(
      item.updatedRevision <= snapshot.board.revision &&
        item.titleRevision <= item.updatedRevision,
      400,
      'Backup contains invalid revisions',
    );
  for (const item of snapshot.cards) {
    assert(
      columns.has(item.columnId),
      400,
      'Backup contains broken relationships',
    );
    assert(
      item.updatedRevision <= snapshot.board.revision &&
        [
          item.titleRevision,
          item.descriptionRevision,
          item.assigneeRevision,
          item.dueDateRevision,
        ].every((revision) => revision <= item.updatedRevision),
      400,
      'Backup contains invalid revisions',
    );
  }
  for (const item of snapshot.comments) {
    assert(cards.has(item.cardId), 400, 'Backup contains broken relationships');
    comments.set(item.cardId, (comments.get(item.cardId) ?? 0) + 1);
  }
  for (const item of [...snapshot.attachments, ...references]) {
    assert(cards.has(item.cardId), 400, 'Backup contains broken relationships');
    attachments.set(item.cardId, (attachments.get(item.cardId) ?? 0) + 1);
  }
  assert(
    [...comments.values()].every((count) => count <= LIMITS.commentsPerCard) &&
      [...attachments.values()].every(
        (count) => count <= LIMITS.attachmentsPerCard,
      ),
    400,
    'Backup exceeds per-card limits',
  );
  return backup;
}
export async function parseBoardBackup(input: unknown): Promise<BoardBackup> {
  const backup = validateBackupRelations(boardBackupSchema.parse(input));
  if (backup.format === 'collabedge.board.v2') {
    const { checksum, ...payload } = backup;
    assert(
      (await sha256(canonicalJson(payload))) === checksum.value,
      400,
      'Backup checksum does not match',
    );
  }
  return backup;
}
export async function createBoardBackup(
  snapshot: Snapshot,
  people: { id: string; name: string }[],
) {
  const payload = validateBackupRelations(
    boardBackupSchema.parse({
      format: 'collabedge.board.v2',
      exportedAt: new Date().toISOString(),
      snapshot,
      people,
      attachmentContentsIncluded: false,
      checksum: { algorithm: 'SHA-256', value: '0'.repeat(64) },
    }),
  );
  if (payload.format !== 'collabedge.board.v2')
    throw new Error('Invalid export format');
  const {
    format,
    exportedAt,
    snapshot: checkedSnapshot,
    people: checkedPeople,
    attachmentContentsIncluded,
  } = payload;
  const data = {
    format,
    exportedAt,
    snapshot: checkedSnapshot,
    people: checkedPeople,
    attachmentContentsIncluded,
  };
  return {
    ...data,
    checksum: {
      algorithm: 'SHA-256' as const,
      value: await sha256(canonicalJson(data)),
    },
  };
}
