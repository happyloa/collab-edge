import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword, sessionHash } from '../src/auth/crypto';
import { prepareMutation, ConflictError } from '../src/realtime/mutations';
import {
  applyEvent,
  applyPatch,
  byPosition,
  ordered,
} from '../src/realtime/board-reducer';
import { clientMessage, type Snapshot } from '../src/realtime/protocol';
import { matchesCard } from '../src/realtime/card-filters';
const boardId = crypto.randomUUID(),
  columnId = crypto.randomUUID(),
  cardId = crypto.randomUUID(),
  actorId = crypto.randomUUID();
const state: Snapshot = {
  board: {
    id: boardId,
    workspaceId: crypto.randomUUID(),
    name: 'Test',
    revision: 2,
    nameRevision: 0,
    archived: false,
  },
  columns: [
    {
      id: columnId,
      boardId,
      title: 'Backlog',
      position: 0,
      updatedRevision: 0,
      titleRevision: 0,
    },
  ],
  cards: [
    {
      id: cardId,
      boardId,
      columnId,
      title: 'Bob changed this',
      description: 'Original',
      position: 0,
      archived: false,
      updatedRevision: 2,
      titleRevision: 2,
      descriptionRevision: 0,
      assigneeId: null,
      dueDate: null,
      assigneeRevision: 0,
      dueDateRevision: 0,
    },
  ],
  comments: [],
  attachments: [],
};
describe('security and synchronization', () => {
  it('validates real calendar dates and keeps independent metadata edits mergeable', () => {
    expect(
      clientMessage.safeParse({
        type: 'mutate',
        mutation: {
          clientMutationId: crypto.randomUUID(),
          baseRevision: 2,
          command: {
            type: 'card.update',
            payload: { id: cardId, dueDate: '2026-02-30' },
          },
        },
      }).success,
    ).toBe(false);
    const updated = applyPatch(
      state,
      prepareMutation(
        state,
        {
          clientMutationId: crypto.randomUUID(),
          baseRevision: 2,
          command: {
            type: 'card.update',
            payload: { id: cardId, dueDate: '2027-01-01' },
          },
        },
        actorId,
      ),
    );
    const assigned = prepareMutation(
      updated,
      {
        clientMutationId: crypto.randomUUID(),
        baseRevision: 2,
        command: {
          type: 'card.update',
          payload: { id: cardId, assigneeId: actorId },
        },
      },
      actorId,
    );
    expect(assigned.cards?.[0]).toMatchObject({
      dueDate: '2027-01-01',
      assigneeId: actorId,
    });
    expect(
      matchesCard(
        { ...state.cards[0], dueDate: '2027-01-01' },
        'BOB',
        'unassigned',
        'overdue',
        '2027-01-02',
      ),
    ).toBe(true);
    expect(matchesCard(state.cards[0], '', actorId, '', '2027-01-02')).toBe(
      false,
    );
  });
  it('applies board renames, rejects stale names and makes archived boards read-only', () => {
    const rename = {
      clientMutationId: crypto.randomUUID(),
      baseRevision: 2,
      command: {
        type: 'board.rename' as const,
        payload: { id: boardId, title: 'Renamed' },
      },
    };
    const payload = prepareMutation(state, rename, actorId);
    const renamed = applyEvent(state, {
      boardId,
      revision: 3,
      eventId: crypto.randomUUID(),
      clientMutationId: rename.clientMutationId,
      actorId,
      type: 'board.rename',
      payload,
      createdAt: new Date().toISOString(),
    });
    expect(renamed.board).toMatchObject({
      name: 'Renamed',
      nameRevision: 3,
      revision: 3,
    });
    expect(() =>
      prepareMutation(
        renamed,
        {
          ...rename,
          command: {
            type: 'board.rename',
            payload: { id: boardId, title: 'Stale' },
          },
        },
        actorId,
      ),
    ).toThrow(ConflictError);
    const archive = {
      clientMutationId: crypto.randomUUID(),
      baseRevision: 3,
      command: { type: 'board.archive' as const, payload: { id: boardId } },
    };
    expect(() =>
      prepareMutation(renamed, { ...archive, baseRevision: 2 }, actorId),
    ).toThrow(ConflictError);
    const archived = applyPatch(
      renamed,
      prepareMutation(renamed, archive, actorId),
    );
    expect(archived.board.archived).toBe(true);
    expect(() =>
      prepareMutation(archived, { ...rename, baseRevision: 3 }, actorId),
    ).toThrow('This board is archived');
  });
  it('salts passwords and verifies in the Workers runtime', async () => {
    const secret = 'a-test-secret-with-at-least-thirty-two-characters';
    const hash = await hashPassword('correct-horse-battery', secret);
    expect(await verifyPassword('correct-horse-battery', hash, secret)).toBe(
      true,
    );
    expect(await verifyPassword('wrong-password', hash, secret)).toBe(false);
    expect(
      await verifyPassword(
        'correct-horse-battery',
        hash,
        'a-different-secret-with-at-least-thirty-two-characters',
      ),
    ).toBe(false);
    expect(await hashPassword('correct-horse-battery', secret)).not.toBe(hash);
    expect(
      await verifyPassword(
        'correct-horse-battery',
        'pbkdf2-sha256$600000$00000000000000000000000000000000$0000000000000000000000000000000000000000000000000000000000000000',
        secret,
      ),
    ).toBe(false);
  });
  it('binds session hashes to the secret', async () => {
    expect(await sessionHash('token', 'secret1')).not.toBe(
      await sessionHash('token', 'secret2'),
    );
  });
  it('rejects malformed commands', () => {
    expect(
      clientMessage.safeParse({
        type: 'mutate',
        mutation: { baseRevision: -1 },
      }).success,
    ).toBe(false);
  });
  it('rejects same-field stale edits', () => {
    expect(() =>
      prepareMutation(
        state,
        {
          clientMutationId: crypto.randomUUID(),
          baseRevision: 1,
          command: {
            type: 'card.update',
            payload: { id: cardId, title: 'Alice old edit' },
          },
        },
        actorId,
      ),
    ).toThrow(ConflictError);
  });
  it('accepts a stale edit to a different field', () => {
    const patch = prepareMutation(
      state,
      {
        clientMutationId: crypto.randomUUID(),
        baseRevision: 1,
        command: {
          type: 'card.update',
          payload: { id: cardId, description: 'Independent edit' },
        },
      },
      actorId,
    );
    expect(patch.cards?.[0].titleRevision).toBe(2);
    expect(patch.cards?.[0].descriptionRevision).toBe(3);
  });
  it('writes only the edited card on a full board', () => {
    const fullBoard: Snapshot = {
      ...state,
      cards: [
        state.cards[0],
        ...Array.from({ length: 199 }, (_, position) => ({
          ...state.cards[0],
          id: crypto.randomUUID(),
          position: position + 1,
        })),
      ],
    };
    const patch = prepareMutation(
      fullBoard,
      {
        clientMutationId: crypto.randomUUID(),
        baseRevision: fullBoard.board.revision,
        command: {
          type: 'card.update',
          payload: { id: cardId, title: 'Only this card changed' },
        },
      },
      actorId,
    );
    expect(patch.cards?.map((card) => card.id)).toEqual([cardId]);
    expect(patch.columns).toEqual([]);
  });
  it('accepts stale creates while the parent exists', () => {
    const patch = prepareMutation(
      state,
      {
        clientMutationId: crypto.randomUUID(),
        baseRevision: 0,
        command: {
          type: 'card.create',
          payload: { id: crypto.randomUUID(), columnId, title: 'New' },
        },
      },
      actorId,
    );
    expect(applyPatch(state, patch).cards).toHaveLength(2);
  });
  it('reorders by server anchors and normalizes positions', () => {
    expect(
      ordered(
        [
          { id: 'a', position: 0 },
          { id: 'b', position: 10 },
        ],
        'b',
        'a',
      ),
    ).toEqual([
      { id: 'b', position: 0 },
      { id: 'a', position: 1 },
    ]);
  });
  it('places new cards and columns after the highest position', () => {
    // A card moved out of the column leaves a gap; counting the remaining
    // cards would hand the new card the position of the existing one.
    const gapped = {
      ...state,
      columns: [{ ...state.columns[0], position: 3 }],
      cards: [{ ...state.cards[0], position: 1 }],
    };
    const create = (
      command: Parameters<typeof prepareMutation>[1]['command'],
    ) =>
      prepareMutation(
        gapped,
        { clientMutationId: crypto.randomUUID(), baseRevision: 2, command },
        actorId,
      );
    const card = create({
      type: 'card.create',
      payload: { id: crypto.randomUUID(), columnId, title: 'New' },
    });
    expect(card.cards?.[0]?.position).toBe(2);
    const column = create({
      type: 'column.create',
      payload: { id: crypto.randomUUID(), title: 'Later' },
    });
    expect(column.columns?.[0]?.position).toBe(4);
  });
  it('breaks position ties by ID so every client shows the same order', () => {
    expect(
      [
        { id: 'b', position: 1 },
        { id: 'a', position: 1 },
        { id: 'c', position: 0 },
      ]
        .sort(byPosition)
        .map((item) => item.id),
    ).toEqual(['c', 'a', 'b']);
  });
  it('detects replay gaps and ignores already applied events', () => {
    const event = {
      boardId,
      revision: 4,
      eventId: crypto.randomUUID(),
      clientMutationId: crypto.randomUUID(),
      actorId,
      type: 'card.update',
      payload: {},
      createdAt: new Date().toISOString(),
    };
    expect(() => applyEvent(state, event)).toThrow('revision_gap');
    expect(applyEvent(state, { ...event, revision: 2 })).toBe(state);
  });
});
describe('comment edits', () => {
  const commentId = crypto.randomUUID(),
    otherId = crypto.randomUUID();
  const withComment: Snapshot = {
    ...state,
    comments: [
      {
        id: commentId,
        cardId,
        boardId,
        actorId,
        body: 'First draft',
        createdAt: '2026-11-01T00:00:00.000Z',
      },
    ],
  };
  const run = (
    snapshot: Snapshot,
    command: Parameters<typeof prepareMutation>[1]['command'],
    actor = actorId,
    baseRevision = 2,
    moderator = false,
  ) =>
    prepareMutation(
      snapshot,
      { clientMutationId: crypto.randomUUID(), baseRevision, command },
      actor,
      moderator,
    );
  const update = (body: string) => ({
    type: 'comment.update' as const,
    payload: { id: commentId, body },
  });
  const remove = {
    type: 'comment.remove' as const,
    payload: { id: commentId },
  };

  it('lets only the author edit and stamps the edit revision', () => {
    const patch = run(withComment, update('Second draft'));
    expect(patch.comments).toHaveLength(1);
    expect(patch.comments?.[0]).toMatchObject({
      id: commentId,
      body: 'Second draft',
      bodyRevision: 3,
      createdAt: '2026-11-01T00:00:00.000Z',
    });
    expect(patch.comments?.[0]?.editedAt).toBeTruthy();
    expect(applyPatch(withComment, patch).comments).toHaveLength(1);
    expect(() => run(withComment, update('Hijacked'), otherId)).toThrow(
      'Only the author can edit this comment',
    );
    // Not even a workspace owner rewrites someone else's words.
    expect(() =>
      run(withComment, update('Hijacked'), otherId, 2, true),
    ).toThrow('Only the author can edit this comment');
  });
  it('does not mark an unchanged body as edited', () => {
    const patch = run(withComment, update('First draft'));
    expect(patch.comments).toEqual([]);
  });
  it('rejects a stale edit or delete after a newer edit', () => {
    const edited: Snapshot = {
      ...withComment,
      board: { ...state.board, revision: 3 },
      comments: [
        { ...withComment.comments[0], body: 'Newer', bodyRevision: 3 },
      ],
    };
    expect(() => run(edited, update('Stale'), actorId, 2)).toThrow(
      ConflictError,
    );
    expect(() => run(edited, remove, actorId, 2)).toThrow(ConflictError);
    expect(
      run(edited, update('Fresh'), actorId, 3).comments?.[0],
    ).toMatchObject({ body: 'Fresh', bodyRevision: 4 });
  });
  it('lets the author or a workspace owner delete, and nobody else', () => {
    const patch = run(withComment, remove);
    expect(patch.removedComments).toEqual([commentId]);
    expect(patch.comments).toEqual([]);
    expect(applyPatch(withComment, patch).comments).toEqual([]);
    expect(() => run(withComment, remove, otherId)).toThrow(
      'Only the author or a workspace owner can delete this comment',
    );
    expect(run(withComment, remove, otherId, 2, true).removedComments).toEqual([
      commentId,
    ]);
  });
  it('treats deleting a missing comment as done and editing it as an error', () => {
    const patch = run(state, remove);
    expect(patch.removedComments).toBeUndefined();
    expect(patch.comments).toEqual([]);
    expect(() => run(state, update('Too late'))).toThrow(
      'Comment no longer exists',
    );
  });
  it('keeps imported comments and archived cards read-only', () => {
    const imported: Snapshot = {
      ...withComment,
      comments: [{ ...withComment.comments[0], importedAuthorName: 'Carol' }],
    };
    expect(() => run(imported, update('Rewritten'))).toThrow(
      'Only the author can edit this comment',
    );
    expect(run(imported, remove).removedComments).toEqual([commentId]);
    const archived: Snapshot = {
      ...withComment,
      cards: [{ ...state.cards[0], archived: true }],
    };
    expect(() => run(archived, update('Rewritten'))).toThrow(
      'Card no longer exists',
    );
    expect(() => run(archived, remove)).toThrow('Card no longer exists');
  });
});
