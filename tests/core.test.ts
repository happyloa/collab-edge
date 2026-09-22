import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword, sessionHash } from '../src/auth/crypto';
import { prepareMutation, ConflictError } from '../src/realtime/mutations';
import { applyEvent, applyPatch, ordered } from '../src/realtime/board-reducer';
import { clientMessage, type Snapshot } from '../src/realtime/protocol';
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
    },
  ],
  comments: [],
  attachments: [],
};
describe('security and synchronization', () => {
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
    const hash = await hashPassword('correct-horse-battery');
    expect(await verifyPassword('correct-horse-battery', hash)).toBe(true);
    expect(await verifyPassword('wrong-password', hash)).toBe(false);
    expect(await hashPassword('correct-horse-battery')).not.toBe(hash);
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
