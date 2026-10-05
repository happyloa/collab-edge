import { assert } from '../lib/errors';
import { LIMITS } from '../lib/limits';

type WorkspaceRow = { id: string; memberCount: number; boardCount: number };
type BoardRow = {
  id: string;
  name: string;
  archived: number;
  revision: number;
  columnCount: number;
  cardCount: number;
  archivedCardCount: number;
  commentCount: number;
  busiestCardComments: number;
};

export async function workspaceUsage(
  binding: D1Database,
  workspaceId: string,
  actorId: string,
  attachmentsEnabled: boolean,
) {
  // Both reads authorize independently in the same D1 batch. No workspace
  // names, counts or other owners' data are returned after membership changes.
  const [workspace, boardRows] = await binding.batch([
    binding
      .prepare(
        `
      SELECT w.id,
        (SELECT COUNT(*) FROM workspace_members WHERE workspace_id=w.id) AS memberCount,
        (SELECT COUNT(*) FROM boards WHERE workspace_id=w.id) AS boardCount
      FROM workspaces w
      JOIN workspace_members actor ON actor.workspace_id=w.id AND actor.user_id=?
      WHERE w.id=? AND w.owner_id=? AND actor.role='OWNER'
    `,
      )
      .bind(actorId, workspaceId, actorId),
    binding
      .prepare(
        `
      SELECT b.id,b.name,b.archived,b.revision,
        (SELECT COUNT(*) FROM board_columns WHERE board_id=b.id) AS columnCount,
        (SELECT COUNT(*) FROM cards WHERE board_id=b.id) AS cardCount,
        (SELECT COUNT(*) FROM cards WHERE board_id=b.id AND archived=1) AS archivedCardCount,
        (SELECT COUNT(*) FROM card_comments WHERE board_id=b.id) AS commentCount,
        COALESCE((SELECT COUNT(*) FROM card_comments WHERE board_id=b.id
          GROUP BY card_id ORDER BY COUNT(*) DESC LIMIT 1),0) AS busiestCardComments
      FROM boards b
      JOIN workspaces w ON w.id=b.workspace_id
      JOIN workspace_members actor ON actor.workspace_id=w.id AND actor.user_id=?
      WHERE w.id=? AND w.owner_id=? AND actor.role='OWNER'
      ORDER BY b.name,b.id
    `,
      )
      .bind(actorId, workspaceId, actorId),
  ]);
  const row = workspace.results[0] as WorkspaceRow | undefined;
  assert(row, 403, 'Workspace usage access denied');
  return {
    measuredAt: new Date().toISOString(),
    workspaceId: row.id,
    members: { used: row.memberCount, limit: LIMITS.membersPerWorkspace },
    boards: { used: row.boardCount, limit: LIMITS.boardsPerWorkspace },
    attachmentsEnabled,
    boardUsage: (boardRows.results as BoardRow[]).map((board) => ({
      id: board.id,
      name: board.name,
      archived: Boolean(board.archived),
      columns: { used: board.columnCount, limit: LIMITS.columnsPerBoard },
      cards: { used: board.cardCount, limit: LIMITS.cardsPerBoard },
      archivedCards: board.archivedCardCount,
      commentCount: board.commentCount,
      busiestCardComments: {
        used: board.busiestCardComments,
        limit: LIMITS.commentsPerCard,
      },
      changes: { used: board.revision, limit: LIMITS.eventsPerBoard },
    })),
  };
}
export type WorkspaceUsage = Awaited<ReturnType<typeof workspaceUsage>>;
