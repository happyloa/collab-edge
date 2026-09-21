import type { Snapshot, Patch, BoardEvent, Mutation } from './protocol';
function upsert<T extends { id: string }>(items: T[], updates: T[] = []) {
  const values = new Map(items.map((item) => [item.id, item]));
  for (const item of updates) values.set(item.id, item);
  return [...values.values()];
}
export function applyPatch(state: Snapshot, patch: Patch): Snapshot {
  const removed = new Set(patch.removedColumns ?? []);
  const cards = upsert(state.cards, patch.cards).filter(
    (c) => !removed.has(c.columnId),
  );
  const cardIds = new Set(cards.map((c) => c.id));
  return {
    ...state,
    columns: upsert(state.columns, patch.columns).filter(
      (c) => !removed.has(c.id),
    ),
    cards,
    comments: upsert(state.comments, patch.comments).filter((c) =>
      cardIds.has(c.cardId),
    ),
    attachments: upsert(state.attachments, patch.attachments).filter(
      (a) => cardIds.has(a.cardId) && !patch.removedAttachments?.includes(a.id),
    ),
  };
}
export function applyEvent(state: Snapshot, event: BoardEvent) {
  if (event.revision <= state.board.revision) return state;
  if (event.revision !== state.board.revision + 1)
    throw new Error('revision_gap');
  return {
    ...applyPatch(state, event.payload),
    board: { ...state.board, revision: event.revision },
  };
}
export function ordered<T extends { id: string; position: number }>(
  items: T[],
  movingId: string,
  beforeId: string | null,
) {
  const moving = items.find((item) => item.id === movingId);
  if (!moving) throw new Error('Entity not found');
  const rest = items
    .filter((item) => item.id !== movingId)
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  const index = beforeId
    ? rest.findIndex((item) => item.id === beforeId)
    : rest.length;
  rest.splice(index < 0 ? rest.length : index, 0, moving);
  return rest.map((item, position) => ({ ...item, position }));
}
export function optimistic(
  state: Snapshot,
  mutation: Mutation,
  actorId: string,
): Snapshot {
  const { command: c } = mutation;
  const revision = state.board.revision;
  switch (c.type) {
    case 'card.create':
      return applyPatch(state, {
        cards: [
          {
            ...c.payload,
            boardId: state.board.id,
            description: '',
            archived: false,
            position: state.cards.filter(
              (v) => v.columnId === c.payload.columnId,
            ).length,
            updatedRevision: revision,
            titleRevision: revision,
            descriptionRevision: revision,
          },
        ],
      });
    case 'column.create':
      return applyPatch(state, {
        columns: [
          {
            ...c.payload,
            boardId: state.board.id,
            position: state.columns.length,
            updatedRevision: revision,
            titleRevision: revision,
          },
        ],
      });
    case 'card.update':
      return {
        ...state,
        cards: state.cards.map((card) =>
          card.id === c.payload.id ? { ...card, ...c.payload } : card,
        ),
      };
    case 'column.rename':
      return {
        ...state,
        columns: state.columns.map((col) =>
          col.id === c.payload.id ? { ...col, title: c.payload.title } : col,
        ),
      };
    case 'card.archive':
      return {
        ...state,
        cards: state.cards.map((card) =>
          card.id === c.payload.id ? { ...card, archived: true } : card,
        ),
      };
    case 'column.remove':
      return applyPatch(state, { removedColumns: [c.payload.id] });
    case 'column.move':
      return {
        ...state,
        columns: ordered(state.columns, c.payload.id, c.payload.beforeId),
      };
    case 'card.move': {
      const moving = state.cards.find((card) => card.id === c.payload.id);
      if (!moving) return state;
      return applyPatch(state, {
        cards: ordered(
          [
            ...state.cards.filter(
              (card) =>
                card.columnId === c.payload.columnId && card.id !== moving.id,
            ),
            { ...moving, columnId: c.payload.columnId },
          ],
          moving.id,
          c.payload.beforeId,
        ),
      });
    }
    case 'comment.create':
      return applyPatch(state, {
        comments: [
          {
            ...c.payload,
            boardId: state.board.id,
            actorId,
            createdAt: new Date().toISOString(),
          },
        ],
      });
  }
}
