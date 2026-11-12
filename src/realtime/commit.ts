import type { BoardEvent, Mutation } from './protocol';

/**
 * Statements that persist one accepted mutation. They run as a single D1 batch:
 * the guards, entity writes, new revision and event commit together or not at
 * all. A CHECK constraint on mutation_guard aborts the batch when a guard
 * selects anything other than 1.
 */
export function commitStatements(
  db: D1Database,
  {
    baseRevision,
    workspaceId,
    mutation,
    event,
  }: {
    baseRevision: number;
    workspaceId: string;
    mutation: Mutation;
    event: BoardEvent;
  },
): D1PreparedStatement[] {
  const { boardId, actorId, payload: patch } = event;
  const assignment =
    mutation.command.type === 'card.update'
      ? mutation.command.payload.assigneeId
      : undefined;
  // Entity IDs are client-chosen primary keys shared by every board. The
  // snapshot only proves an ID is unused on this board, so upserts are scoped
  // to it and this guard aborts the batch unless every row landed here.
  const persistedHere = (table: 'board_columns' | 'cards', ids: string[]) =>
    db
      .prepare(
        `INSERT INTO mutation_guard(value) SELECT CASE WHEN (
          SELECT count(*) FROM ${table}
          WHERE board_id=? AND id IN (SELECT value FROM json_each(?))
        )=? THEN 1 ELSE 0 END`,
      )
      .bind(boardId, JSON.stringify(ids), ids.length);
  const statements: D1PreparedStatement[] = [
    // A stale revision aborts everything that follows.
    db
      .prepare(
        'INSERT INTO mutation_guard(value) SELECT CASE WHEN revision=? THEN 1 ELSE 0 END FROM boards WHERE id=?',
      )
      .bind(baseRevision, boardId),
  ];
  if (assignment)
    statements.push(
      db
        .prepare(
          'INSERT INTO mutation_guard(value) SELECT CASE WHEN EXISTS(SELECT 1 FROM workspace_members WHERE workspace_id=? AND user_id=?) THEN 1 ELSE 0 END',
        )
        .bind(workspaceId, assignment),
    );
  if (patch.board)
    statements.push(
      db
        .prepare(
          'UPDATE boards SET name=?,name_revision=?,archived=? WHERE id=?',
        )
        .bind(
          patch.board.name,
          patch.board.nameRevision,
          Number(patch.board.archived),
          boardId,
        ),
    );
  for (const col of patch.columns ?? [])
    statements.push(
      db
        .prepare(
          'INSERT INTO board_columns(id,board_id,title,position,updated_revision,title_revision) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,position=excluded.position,updated_revision=excluded.updated_revision,title_revision=excluded.title_revision WHERE board_columns.board_id=excluded.board_id',
        )
        .bind(
          col.id,
          boardId,
          col.title,
          col.position,
          col.updatedRevision,
          col.titleRevision,
        ),
    );
  if (patch.columns?.length)
    statements.push(
      persistedHere(
        'board_columns',
        patch.columns.map((col) => col.id),
      ),
    );
  if (mutation.command.type === 'card.move' && patch.cards?.length) {
    // One statement keeps large reorders below the Workers Free D1 query cap.
    const positions = patch.cards.map(({ id, columnId, position }) => ({
      id,
      columnId,
      position,
    }));
    statements.push(
      db
        .prepare(
          `WITH moved AS (
            SELECT json_extract(value, '$.id') AS id,
                   json_extract(value, '$.columnId') AS column_id,
                   CAST(json_extract(value, '$.position') AS INTEGER) AS position
            FROM json_each(?)
          )
          UPDATE cards
          SET column_id = (SELECT column_id FROM moved WHERE moved.id = cards.id),
              position = (SELECT position FROM moved WHERE moved.id = cards.id),
              updated_revision = ?
          WHERE board_id = ? AND id IN (SELECT id FROM moved)`,
        )
        .bind(JSON.stringify(positions), event.revision, boardId),
    );
  } else {
    for (const card of patch.cards ?? [])
      statements.push(
        db
          .prepare(
            'INSERT INTO cards(id,board_id,column_id,title,description,position,archived,updated_revision,title_revision,description_revision,assignee_id,due_date,assignee_revision,due_date_revision) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET column_id=excluded.column_id,title=excluded.title,description=excluded.description,position=excluded.position,archived=excluded.archived,updated_revision=excluded.updated_revision,title_revision=excluded.title_revision,description_revision=excluded.description_revision,assignee_id=excluded.assignee_id,due_date=excluded.due_date,assignee_revision=excluded.assignee_revision,due_date_revision=excluded.due_date_revision WHERE cards.board_id=excluded.board_id',
          )
          .bind(
            card.id,
            boardId,
            card.columnId,
            card.title,
            card.description,
            card.position,
            Number(card.archived),
            card.updatedRevision,
            card.titleRevision,
            card.descriptionRevision,
            card.assigneeId,
            card.dueDate,
            card.assigneeRevision,
            card.dueDateRevision,
          ),
      );
    if (patch.cards?.length)
      statements.push(
        persistedHere(
          'cards',
          patch.cards.map((card) => card.id),
        ),
      );
  }
  for (const comment of patch.comments ?? [])
    statements.push(
      db
        .prepare(
          'INSERT INTO card_comments(id,card_id,board_id,actor_id,body,created_at) VALUES(?,?,?,?,?,?)',
        )
        .bind(
          comment.id,
          comment.cardId,
          boardId,
          actorId,
          comment.body,
          comment.createdAt,
        ),
    );
  for (const id of patch.removedColumns ?? [])
    statements.push(
      db
        .prepare('DELETE FROM board_columns WHERE id=? AND board_id=?')
        .bind(id, boardId),
    );
  statements.push(
    db
      .prepare('UPDATE boards SET revision=? WHERE id=?')
      .bind(event.revision, boardId),
    db
      .prepare(
        'INSERT INTO board_events(event_id,board_id,revision,client_mutation_id,actor_id,type,payload,created_at) VALUES(?,?,?,?,?,?,?,?)',
      )
      .bind(
        event.eventId,
        boardId,
        event.revision,
        event.clientMutationId,
        actorId,
        event.type,
        JSON.stringify(patch),
        event.createdAt,
      ),
    db.prepare('DELETE FROM mutation_guard'),
  );
  return statements;
}
