import type { Snapshot, Mutation, Patch } from './protocol';
import { optimistic } from './board-reducer';
import { assert, AppError } from '../lib/errors';
import { LIMITS } from '../lib/limits';
export class ConflictError extends AppError {
  constructor() {
    super(
      409,
      'This field changed while you were editing. Your draft is preserved.',
    );
  }
}
export function prepareMutation(
  state: Snapshot,
  mutation: Mutation,
  actorId: string,
): Patch {
  const { command: c, baseRevision } = mutation;
  assert(baseRevision <= state.board.revision, 400, 'Invalid base revision');
  assert(
    !state.board.archived || c.type === 'board.archive',
    410,
    'This board is archived',
  );
  const next = state.board.revision + 1;
  const card = state.cards.find((v) => v.id === c.payload.id);
  const column = state.columns.find((v) => v.id === c.payload.id);
  const changed = (revision: number) => {
    if (revision > baseRevision) throw new ConflictError();
  };
  if (
    c.type.startsWith('card.') &&
    c.type !== 'card.create' &&
    c.type !== 'card.archive'
  )
    assert(card && !card.archived, 404, 'Card no longer exists');
  if (
    c.type.startsWith('column.') &&
    c.type !== 'column.create' &&
    c.type !== 'column.remove'
  )
    assert(column, 404, 'Column no longer exists');
  switch (c.type) {
    case 'board.rename':
      assert(c.payload.id === state.board.id, 400, 'Invalid board ID');
      if (c.payload.title !== state.board.name)
        changed(state.board.nameRevision);
      break;
    case 'board.archive':
      assert(c.payload.id === state.board.id, 400, 'Invalid board ID');
      if (!state.board.archived) changed(state.board.revision);
      break;
    case 'card.create':
      assert(
        state.columns.some((v) => v.id === c.payload.columnId),
        404,
        'Column no longer exists',
      );
      assert(!card, 409, 'Card ID already exists');
      assert(
        state.cards.length < LIMITS.cardsPerBoard,
        429,
        'Board card limit reached',
      );
      break;
    case 'column.create':
      assert(!column, 409, 'Column ID already exists');
      assert(
        state.columns.length < LIMITS.columnsPerBoard,
        429,
        'Column limit reached',
      );
      break;
    case 'card.update':
      if (card) {
        if (c.payload.title !== undefined && c.payload.title !== card.title)
          changed(card.titleRevision);
        if (
          c.payload.description !== undefined &&
          c.payload.description !== card.description
        )
          changed(card.descriptionRevision);
      }
      break;
    case 'column.rename':
      if (column && c.payload.title !== column.title)
        changed(column.titleRevision);
      break;
    case 'column.remove':
      if (column) {
        changed(column.updatedRevision);
        assert(
          !state.cards.some((v) => v.columnId === column.id),
          409,
          'Move or archive and retain cards before removing this column. Only empty columns can be removed.',
        );
      }
      break;
    case 'card.archive':
      if (card && !card.archived) changed(card.updatedRevision);
      break;
    case 'card.move':
      assert(
        state.columns.some((v) => v.id === c.payload.columnId),
        404,
        'Destination no longer exists',
      );
      break;
    case 'comment.create':
      assert(
        state.cards.some((v) => v.id === c.payload.cardId && !v.archived),
        404,
        'Card no longer exists',
      );
      assert(
        !state.comments.some((v) => v.id === c.payload.id),
        409,
        'Comment ID already exists',
      );
      assert(
        state.comments.filter((v) => v.cardId === c.payload.cardId).length <
          LIMITS.commentsPerCard,
        429,
        'Comment limit reached',
      );
      break;
  }
  const after = optimistic(state, mutation, actorId);
  const patch: Patch = {};
  if (c.type === 'board.rename' || c.type === 'board.archive')
    patch.board = {
      name: after.board.name,
      archived: after.board.archived,
      nameRevision: c.type === 'board.rename' ? next : after.board.nameRevision,
    };
  if (c.type === 'column.remove') patch.removedColumns = [c.payload.id];
  patch.columns = after.columns
    .filter(
      (v) =>
        JSON.stringify(v) !==
        JSON.stringify(state.columns.find((old) => old.id === v.id)),
    )
    .map((v) => ({
      ...v,
      updatedRevision: next,
      titleRevision:
        c.type === 'column.rename' || c.type === 'column.create'
          ? next
          : v.titleRevision,
    }));
  patch.cards = after.cards
    .filter(
      (v) =>
        JSON.stringify(v) !==
        JSON.stringify(state.cards.find((old) => old.id === v.id)),
    )
    .map((v) => ({
      ...v,
      updatedRevision: next,
      titleRevision:
        c.type === 'card.create' ||
        (c.type === 'card.update' && c.payload.title !== undefined)
          ? next
          : v.titleRevision,
      descriptionRevision:
        c.type === 'card.create' ||
        (c.type === 'card.update' && c.payload.description !== undefined)
          ? next
          : v.descriptionRevision,
    }));
  patch.comments = after.comments.filter(
    (v) => !state.comments.some((old) => old.id === v.id),
  );
  return patch;
}
