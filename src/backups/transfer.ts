import { z } from 'zod';
import {
  backupColumn,
  backupCard,
  backupComment,
  backupAttachment,
  peopleSchema,
  sha256,
  canonicalJson,
  BACKUP_LIMITS,
  type BoardBackup,
} from './format';
import { assert } from '../lib/errors';
import { LIMITS } from '../lib/limits';

const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const restoreHeaderSchema = z
  .object({
    sourceBoardId: z.uuid(),
    sourceRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    name: z.string().min(1).max(160),
    archived: z.boolean(),
    exportedAt: z.iso.datetime({ offset: true }),
    people: peopleSchema,
    counts: z
      .object({
        columns: z.number().int().min(0).max(LIMITS.columnsPerBoard),
        cards: z.number().int().min(0).max(LIMITS.cardsPerBoard),
        comments: z
          .number()
          .int()
          .min(0)
          .max(LIMITS.cardsPerBoard * LIMITS.commentsPerCard),
        attachments: z
          .number()
          .int()
          .min(0)
          .max(LIMITS.cardsPerBoard * LIMITS.attachmentsPerCard),
      })
      .strict(),
  })
  .strict();
export type RestoreHeader = z.infer<typeof restoreHeaderSchema>;
export const restoreRowSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('column'), payload: backupColumn }).strict(),
  z.object({ kind: z.literal('card'), payload: backupCard }).strict(),
  z.object({ kind: z.literal('comment'), payload: backupComment }).strict(),
  z
    .object({ kind: z.literal('attachment'), payload: backupAttachment })
    .strict(),
]);
export type RestoreRow = z.infer<typeof restoreRowSchema>;
export const provenRowSchema = z
  .object({
    index: z
      .number()
      .int()
      .min(1)
      .max(BACKUP_LIMITS.items - 1),
    row: restoreRowSchema,
    proof: z.array(digest).max(14),
  })
  .strict();
export type ProvenRow = z.infer<typeof provenRowSchema>;
export const startRestoreSchema = z
  .object({
    jobId: z.uuid(),
    root: digest,
    header: restoreHeaderSchema,
    proof: z.array(digest).max(14),
    assignees: z
      .record(z.uuid(), z.uuid().nullable())
      .refine((map) => Object.keys(map).length <= LIMITS.cardsPerBoard),
  })
  .strict();
export function itemCount(header: RestoreHeader) {
  return Object.values(header.counts).reduce((sum, count) => sum + count, 0);
}
export function leafHash(index: number, value: RestoreHeader | RestoreRow) {
  return sha256(
    'collabedge-restore-leaf-v1:' + index + ':' + canonicalJson(value),
  );
}
async function parent(left: string, right: string) {
  return sha256('collabedge-restore-node-v1:' + left + ':' + right);
}
export async function verifyProof(
  root: string,
  index: number,
  count: number,
  value: RestoreHeader | RestoreRow,
  proof: string[],
) {
  if (index < 0 || index >= count) return false;
  let width = count,
    hash = await leafHash(index, value),
    depth = 0;
  while (width > 1) {
    const sibling = proof[depth++];
    if (!sibling) return false;
    // Odd final nodes duplicate themselves; accepting another sibling here
    // would permit changing the tree shape without changing the item count.
    if (index % 2 === 0 && index + 1 >= width && sibling !== hash) return false;
    hash =
      index % 2 ? await parent(sibling, hash) : await parent(hash, sibling);
    index = Math.floor(index / 2);
    width = Math.ceil(width / 2);
  }
  return depth === proof.length && hash === root;
}
export function expectedKind(
  header: RestoreHeader,
  index: number,
): RestoreRow['kind'] | null {
  let offset = 1;
  for (const [kind, count] of [
    ['column', header.counts.columns],
    ['card', header.counts.cards],
    ['comment', header.counts.comments],
    ['attachment', header.counts.attachments],
  ] as const) {
    if (index >= offset && index < offset + count) return kind;
    offset += count;
  }
  return null;
}
export async function prepareRestore(backup: BoardBackup) {
  const { snapshot } = backup;
  const rows: RestoreRow[] = [
    ...snapshot.columns.map((payload) => ({
      kind: 'column' as const,
      payload,
    })),
    ...snapshot.cards.map((payload) => ({ kind: 'card' as const, payload })),
    ...snapshot.comments.map((payload) => ({
      kind: 'comment' as const,
      payload,
    })),
    ...[...snapshot.attachments, ...(snapshot.attachmentReferences ?? [])].map(
      (payload) => ({ kind: 'attachment' as const, payload }),
    ),
  ];
  const header: RestoreHeader = {
    sourceBoardId: snapshot.board.id,
    sourceRevision: snapshot.board.revision,
    name: snapshot.board.name,
    archived: snapshot.board.archived,
    exportedAt: backup.exportedAt,
    people: backup.people,
    counts: {
      columns: snapshot.columns.length,
      cards: snapshot.cards.length,
      comments: snapshot.comments.length,
      attachments:
        rows.length -
        snapshot.columns.length -
        snapshot.cards.length -
        snapshot.comments.length,
    },
  };
  const levels: string[][] = [[]];
  // Bounded concurrency also keeps large files from creating thousands of
  // simultaneous Web Crypto operations in a browser.
  for (let start = 0; start < rows.length + 1; start += 64)
    levels[0].push(
      ...(await Promise.all(
        Array.from(
          { length: Math.min(64, rows.length + 1 - start) },
          (_, offset) => {
            const index = start + offset;
            return leafHash(index, index === 0 ? header : rows[index - 1]);
          },
        ),
      )),
    );
  while (levels.at(-1)!.length > 1) {
    const previous = levels.at(-1)!,
      next: string[] = [];
    for (let start = 0; start < previous.length; start += 128)
      next.push(
        ...(await Promise.all(
          Array.from(
            { length: Math.ceil(Math.min(128, previous.length - start) / 2) },
            (_, offset) => {
              const index = start + offset * 2;
              return parent(
                previous[index],
                previous[index + 1] ?? previous[index],
              );
            },
          ),
        )),
      );
    levels.push(next);
  }
  const proof = (index: number) => {
    const result: string[] = [];
    for (const level of levels.slice(0, -1)) {
      result.push(level[index ^ 1] ?? level[index]);
      index = Math.floor(index / 2);
    }
    return result;
  };
  const items = rows.map((row, offset) => ({
    index: offset + 1,
    row,
    proof: proof(offset + 1),
  }));
  return { root: levels.at(-1)![0], header, proof: proof(0), items };
}
export function restoreChunks(items: ProvenRow[]): ProvenRow[][] {
  const chunks: ProvenRow[][] = [];
  let current: ProvenRow[] = [];
  for (const item of items) {
    const next = [...current, item];
    if (
      next.length > BACKUP_LIMITS.chunkItems ||
      new TextEncoder().encode(JSON.stringify({ items: next })).byteLength >
        LIMITS.requestBytes
    ) {
      assert(current.length > 0, 413, 'Backup record exceeds request limits');
      chunks.push(current);
      current = [item];
    } else current = next;
    assert(
      new TextEncoder().encode(JSON.stringify({ items: current })).byteLength <=
        LIMITS.requestBytes,
      413,
      'Backup record exceeds request limits',
    );
  }
  if (current.length) chunks.push(current);
  return chunks;
}
