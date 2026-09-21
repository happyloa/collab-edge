import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { boards, columns, cards, comments, attachments } from '../schema';
import { assert } from '../../lib/errors';
import { snapshotSchema } from '../../realtime/protocol';
export async function loadSnapshot(binding: D1Database, boardId: string) {
  const db = drizzle(binding);
  const [boardRows, columnRows, cardRows, commentRows, attachmentRows] =
    await db.batch([
      db.select().from(boards).where(eq(boards.id, boardId)),
      db.select().from(columns).where(eq(columns.boardId, boardId)),
      db.select().from(cards).where(eq(cards.boardId, boardId)),
      db.select().from(comments).where(eq(comments.boardId, boardId)),
      db.select().from(attachments).where(eq(attachments.boardId, boardId)),
    ]);
  assert(boardRows[0], 404, 'Board not found');
  return snapshotSchema.parse({
    board: boardRows[0],
    columns: columnRows,
    cards: cardRows,
    comments: commentRows,
    attachments: attachmentRows,
  });
}
