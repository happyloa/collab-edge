import { env } from 'cloudflare:workers';
import { expect, it } from 'vitest';
import { loadSnapshot } from '../src/db/queries/snapshot';
import { LIMITS } from '../src/lib/limits';
import { prepareMutation } from '../src/realtime/mutations';

// Synthetic, isolated local D1 fixtures; no remote data or authentication
// credentials. These test representative text sizes, not worst-case payloads.
async function fixture(cardCount: number, commentsPerCard: number) {
  const ownerId = crypto.randomUUID();
  const workspaceId = crypto.randomUUID();
  const boardId = crypto.randomUUID();
  const columnIds = Array.from({ length: 4 }, () => crypto.randomUUID());
  const statements = [
    env.DB.prepare(
      'INSERT INTO users(id,email,name,password,created_at) VALUES(?,?,?,?,?)',
    ).bind(
      ownerId,
      `${ownerId}@snapshot.test`,
      'Snapshot fixture',
      'not-a-login',
      0,
    ),
    env.DB.prepare('INSERT INTO workspaces VALUES(?,?,?)').bind(
      workspaceId,
      'Snapshot scale fixture',
      ownerId,
    ),
    env.DB.prepare(
      'INSERT INTO boards(id,workspace_id,name,revision) VALUES(?,?,?,0)',
    ).bind(boardId, workspaceId, 'Snapshot scale fixture'),
    ...columnIds.map((columnId, index) =>
      env.DB.prepare('INSERT INTO board_columns VALUES(?,?,?,?,0,0)').bind(
        columnId,
        boardId,
        `Column ${index + 1}`,
        index * 1024,
      ),
    ),
  ];
  for (let index = 0; index < cardCount; index++) {
    const cardId = crypto.randomUUID();
    statements.push(
      env.DB.prepare(
        `
      INSERT INTO cards(id,board_id,column_id,title,description,position,archived,updated_revision,title_revision,description_revision)
      VALUES(?,?,?,?,?,?,0,0,0,0)
    `,
      ).bind(
        cardId,
        boardId,
        columnIds[index % 4],
        `Card ${index + 1}`,
        'Description '.repeat(20),
        index * 1024,
      ),
    );
    for (let comment = 0; comment < commentsPerCard; comment++) {
      statements.push(
        env.DB.prepare(
          'INSERT INTO card_comments(id,card_id,board_id,actor_id,body,created_at) VALUES(?,?,?,?,?,?)',
        ).bind(
          crypto.randomUUID(),
          cardId,
          boardId,
          ownerId,
          'A synthetic comment. '.repeat(20),
          '2026-10-05T00:00:00Z',
        ),
      );
    }
  }
  for (let start = 0; start < statements.length; start += 100)
    await env.DB.batch(statements.slice(start, start + 100));
  return boardId;
}

it.for([
  { cards: 25, commentsPerCard: 5 },
  { cards: 100, commentsPerCard: 10 },
  { cards: 200, commentsPerCard: 20 },
])(
  'measures a consistent snapshot with $cards cards and $commentsPerCard comments per card',
  async (size, { annotate }) => {
    expect(size.cards).toBeLessThanOrEqual(LIMITS.cardsPerBoard);
    expect(size.commentsPerCard).toBeLessThanOrEqual(LIMITS.commentsPerCard);
    const boardId = await fixture(size.cards, size.commentsPerCard);
    const metrics = {
      batches: 0,
      queries: 0,
      rowsReturned: 0,
      rowsRead: 0 as number | null,
    };
    const measured = new Proxy(env.DB, {
      get(target, property) {
        if (property === 'batch')
          return async (statements: D1PreparedStatement[]) => {
            metrics.batches++;
            metrics.queries += statements.length;
            const results = await target.batch(statements);
            for (const result of results) {
              metrics.rowsReturned += result.results.length;
              if (typeof result.meta.rows_read !== 'number')
                metrics.rowsRead = null;
              else if (metrics.rowsRead !== null)
                metrics.rowsRead += result.meta.rows_read;
            }
            return results;
          };
        const value = Reflect.get(target, property);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    const start = performance.now();
    const snapshot = await loadSnapshot(measured, boardId);
    const loadMs = performance.now() - start;
    const serialized = JSON.stringify(snapshot);
    const bytes = new TextEncoder().encode(serialized).byteLength;
    const card = snapshot.cards[0];
    const originalTitle = card.title;
    const actorId = snapshot.comments[0].actorId;
    let commentIdReads = 0;
    const measuredState = {
      ...snapshot,
      comments: snapshot.comments.map((comment) => ({
        ...comment,
        get id() {
          commentIdReads++;
          return comment.id;
        },
      })),
    };
    const updateStart = performance.now();
    const update = prepareMutation(
      measuredState,
      {
        clientMutationId: crypto.randomUUID(),
        baseRevision: snapshot.board.revision,
        command: {
          type: 'card.update',
          payload: { id: card.id, title: 'Updated card' },
        },
      },
      actorId,
    );
    const updateMs = performance.now() - updateStart;
    const updateCommentIdReads = commentIdReads;
    commentIdReads = 0;
    const commentStart = performance.now();
    const commentId = crypto.randomUUID();
    const comment = prepareMutation(
      measuredState,
      {
        clientMutationId: crypto.randomUUID(),
        baseRevision: snapshot.board.revision,
        command: {
          type: 'comment.create',
          payload: { id: commentId, cardId: card.id, body: 'New comment' },
        },
      },
      actorId,
    );
    const commentMs = performance.now() - commentStart;
    // Operation counts catch quadratic regressions without machine-dependent
    // timing thresholds. Neither command may rescan all IDs for every comment.
    expect(updateCommentIdReads).toBeLessThan(snapshot.comments.length * 3);
    expect(commentIdReads).toBeLessThan(snapshot.comments.length * 6);
    expect(update.cards?.map((item) => item.id)).toEqual([card.id]);
    expect(update.comments).toEqual([]);
    expect(comment.comments?.map((item) => item.id)).toEqual([commentId]);
    expect(snapshot.cards[0].title).toBe(originalTitle);
    expect(snapshot.comments).toHaveLength(size.cards * size.commentsPerCard);
    expect(snapshot.cards).toHaveLength(size.cards);
    expect(snapshot.comments).toHaveLength(size.cards * size.commentsPerCard);
    expect(snapshot.columns).toHaveLength(4);
    expect(snapshot.attachments).toEqual([]);
    expect(metrics.batches).toBe(1);
    expect(metrics.queries).toBe(5);
    expect(metrics.rowsReturned).toBe(
      1 + 4 + size.cards + size.cards * size.commentsPerCard,
    );
    expect(bytes).toBeLessThan(4 * 1024 * 1024);
    await annotate(
      'SNAPSHOT_SCALE ' +
        JSON.stringify({
          cards: size.cards,
          comments: snapshot.comments.length,
          bytes,
          loadMs: Math.round(loadMs * 100) / 100,
          updateMs: Math.round(updateMs * 100) / 100,
          commentMs: Math.round(commentMs * 100) / 100,
          updateCommentIdReads,
          createCommentIdReads: commentIdReads,
          ...metrics,
        }),
    );
  },
);
