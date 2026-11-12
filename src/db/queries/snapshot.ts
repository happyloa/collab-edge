import { drizzle } from 'drizzle-orm/d1';
import { and, eq, or, sql } from 'drizzle-orm';
import {
  boards,
  columns,
  cards,
  comments,
  attachments,
  attachmentReferences,
  events,
} from '../schema';
import { assert } from '../../lib/errors';
import { snapshotSchema, type Mutation } from '../../realtime/protocol';
export async function loadSnapshot(binding: D1Database, boardId: string) {
  const db = drizzle(binding);
  const [
    boardRows,
    columnRows,
    cardRows,
    commentRows,
    attachmentRows,
    referenceRows,
  ] = await db.batch([
    db.select().from(boards).where(eq(boards.id, boardId)),
    db.select().from(columns).where(eq(columns.boardId, boardId)),
    db.select().from(cards).where(eq(cards.boardId, boardId)),
    db.select().from(comments).where(eq(comments.boardId, boardId)),
    db.select().from(attachments).where(eq(attachments.boardId, boardId)),
    db
      .select()
      .from(attachmentReferences)
      .where(eq(attachmentReferences.boardId, boardId)),
  ]);
  assert(boardRows[0], 404, 'Board not found');
  return snapshotSchema.parse({
    board: boardRows[0],
    columns: columnRows,
    cards: cardRows,
    comments: commentRows.map(({ importedAuthorName, ...comment }) =>
      importedAuthorName === null
        ? comment
        : { ...comment, importedAuthorName },
    ),
    attachments: attachmentRows,
    attachmentReferences: referenceRows,
  });
}

/**
 * One consistent read of what a mutation needs: its earlier receipt, if any,
 * and the rows its command is validated against. Commands order and validate
 * against every column and card, but only `comment.create` reads comments, and
 * only those of its own card plus any row already using its ID. Attachments are
 * never part of a mutation. The returned state is therefore not a complete
 * board and must not be sent to clients; use `loadSnapshot` for that.
 */
export async function loadMutationContext(
  binding: D1Database,
  boardId: string,
  mutation: Mutation,
) {
  const db = drizzle(binding);
  const { command } = mutation;
  const [receipts, boardRows, columnRows, cardRows, commentRows] =
    await db.batch([
      db
        .select()
        .from(events)
        .where(
          and(
            eq(events.boardId, boardId),
            eq(events.clientMutationId, mutation.clientMutationId),
          ),
        ),
      db.select().from(boards).where(eq(boards.id, boardId)),
      db.select().from(columns).where(eq(columns.boardId, boardId)),
      db.select().from(cards).where(eq(cards.boardId, boardId)),
      db
        .select()
        .from(comments)
        .where(
          // Both terms are index lookups. Adding the board here makes SQLite
          // scan the board's whole comment index instead, so rows are scoped
          // to this board after the read.
          command.type === 'comment.create'
            ? or(
                eq(comments.cardId, command.payload.cardId),
                eq(comments.id, command.payload.id),
              )
            : sql`0`,
        ),
    ]);
  if (receipts[0]) return { receipt: receipts[0], state: null } as const;
  assert(boardRows[0], 404, 'Board not found');
  return {
    receipt: null,
    state: snapshotSchema.parse({
      board: boardRows[0],
      columns: columnRows,
      cards: cardRows,
      comments: commentRows
        .filter((comment) => comment.boardId === boardId)
        .map(({ importedAuthorName, ...comment }) =>
          importedAuthorName === null
            ? comment
            : { ...comment, importedAuthorName },
        ),
      attachments: [],
      attachmentReferences: [],
    }),
  } as const;
}
