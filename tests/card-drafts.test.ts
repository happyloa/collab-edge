import { expect, it } from 'vitest';
import {
  draftSchema,
  pendingDraftSchema,
  type CardDraft,
} from '../src/drafts/store';
import { restoreCardDraft } from '../src/drafts/restore';
const ownerId = '9f258724-c4ed-4e86-9c29-c64e31d881d6';
const boardId = '3ed2db2d-1ab5-4d42-a7d7-7ed13aa3b6de';
const draft: CardDraft = {
  kind: 'card',
  version: 1,
  id: crypto.randomUUID(),
  ownerId,
  boardId,
  cardId: crypto.randomUUID(),
  baseRevision: 3,
  original: {
    title: 'Initial title',
    description: 'Initial description',
    assigneeId: ownerId,
    dueDate: '2026-10-10',
  },
  fields: {
    title: 'Initial title',
    description: '',
    assigneeId: null,
    dueDate: null,
  },
  comment: 'Unsent comment',
  updatedAt: Date.now(),
};
it('restores intentional clears with their old baseline while retaining untouched server fields', () => {
  const restored = restoreCardDraft(draft, {
    title: 'A teammate renamed this',
    description: 'A teammate edited this',
    assigneeId: crypto.randomUUID(),
    dueDate: '2026-10-12',
  });
  expect(restored.fields).toEqual({
    title: 'A teammate renamed this',
    description: '',
    assigneeId: null,
    dueDate: null,
  });
  expect(restored.original).toEqual({
    ...draft.original,
    title: 'A teammate renamed this',
  });
  expect(draft.baseRevision).toBe(3);
});
it('rejects malformed, oversized and credential-bearing draft records', () => {
  expect(draftSchema.safeParse(draft).success).toBe(true);
  for (const invalid of [
    { ...draft, ownerId: 'not-a-user' },
    { ...draft, version: 2 },
    { ...draft, password: 'must never be stored' },
    { ...draft, fields: { ...draft.fields, description: 'x'.repeat(10001) } },
    { ...draft, comment: 'x'.repeat(2001) },
    { ...draft, baseRevision: -1 },
  ])
    expect(draftSchema.safeParse(invalid).success).toBe(false);
});
it('requires an original mutation UUID matching its storage key and valid command', () => {
  const mutationId = crypto.randomUUID();
  const pending = {
    kind: 'mutation',
    version: 1,
    id: mutationId,
    ownerId,
    boardId,
    mutation: {
      clientMutationId: mutationId,
      baseRevision: 3,
      command: {
        type: 'comment.create',
        payload: {
          id: crypto.randomUUID(),
          cardId: draft.cardId,
          body: 'One comment',
        },
      },
    },
    state: 'pending',
    updatedAt: Date.now(),
  };
  expect(pendingDraftSchema.safeParse(pending).success).toBe(true);
  expect(
    pendingDraftSchema.safeParse({ ...pending, id: crypto.randomUUID() })
      .success,
  ).toBe(false);
  expect(
    pendingDraftSchema.safeParse({ ...pending, state: 'recovered' }).success,
  ).toBe(false);
});
