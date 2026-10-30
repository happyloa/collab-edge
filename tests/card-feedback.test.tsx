import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { cardFieldStatus } from '../components/board/card-field-status';
import { useCardMovement } from '../components/board/use-card-movement';
import type { Pending, useBoard } from '../src/realtime/socket-client';
import type { BoardEvent, Command, Snapshot } from '../src/realtime/protocol';

afterEach(cleanup);
const card: Snapshot['cards'][number] = {
  id: 'card',
  boardId: 'board',
  columnId: 'backlog',
  title: 'Launch',
  description: '',
  assigneeId: null,
  dueDate: null,
  archived: false,
  position: 0,
  updatedRevision: 1,
  titleRevision: 1,
  descriptionRevision: 1,
  assigneeRevision: 1,
  dueDateRevision: 1,
};
const state: Snapshot = {
  board: {
    id: 'board',
    workspaceId: 'workspace',
    name: 'Project',
    revision: 1,
    nameRevision: 1,
    archived: false,
  },
  columns: [
    {
      id: 'backlog',
      boardId: 'board',
      title: 'Backlog',
      position: 0,
      updatedRevision: 1,
      titleRevision: 1,
    },
  ],
  cards: [card],
  comments: [],
  attachments: [],
};
const command: Extract<Command, { type: 'card.move' }> = {
  type: 'card.move',
  payload: { id: card.id, columnId: 'backlog', beforeId: null },
};
function fieldStatus(pending: Pending[], current = card) {
  return cardFieldStatus({
    field: 'title',
    value: 'Launch',
    original: 'Launch',
    current,
    pending,
    busy: false,
    saveStatus: 'Draft saved on this device.',
  });
}
function update(state: Pending['state']): Pending {
  return {
    state,
    mutation: {
      clientMutationId: 'receipt',
      baseRevision: 1,
      command: {
        type: 'card.update',
        payload: { id: card.id, title: 'Launch' },
      },
    },
  };
}
it('does not call an optimistic matching field server-confirmed while its write is pending', () => {
  expect(fieldStatus([update('pending')])).toBe(
    'Waiting for server confirmation.',
  );
  expect(fieldStatus([update('conflicted')])).toBe(
    'Conflicting submission. Review your attempted value.',
  );
  expect(fieldStatus([update('failed')])).toBe(
    'Submission needs review. Your attempted value is preserved.',
  );
  expect(fieldStatus([])).toBe('Server-confirmed value.');
});
it('keeps independent fields confirmed and distinguishes a local draft from a changed server value', () => {
  const unrelated = update('pending');
  unrelated.mutation.command = {
    type: 'card.update',
    payload: { id: card.id, description: 'Other field' },
  };
  expect(fieldStatus([unrelated])).toBe('Server-confirmed value.');
  expect(fieldStatus([], { ...card, title: 'Teammate edit' })).toBe(
    'The server value changed. Review before submitting.',
  );
  expect(
    cardFieldStatus({
      field: 'title',
      value: 'My draft',
      original: 'Launch',
      current: card,
      pending: [],
      busy: false,
      saveStatus: 'Draft saved on this device.',
    }),
  ).toBe('Saved on this device. Not yet submitted.');
});
function movement() {
  const live: Pick<
    ReturnType<typeof useBoard>,
    'mutate' | 'activity' | 'pending'
  > = {
    mutate: vi
      .fn<ReturnType<typeof useBoard>['mutate']>()
      .mockImplementation(async (...args) => {
        args[2]?.('receipt');
        return true;
      }),
    activity: [],
    pending: [],
  };
  const hook = renderHook(({ live }) => useCardMovement(live, 'alice', state), {
    initialProps: { live },
  });
  return { live, ...hook };
}
const event: BoardEvent = {
  boardId: 'board',
  revision: 2,
  eventId: 'event',
  clientMutationId: 'receipt',
  actorId: 'alice',
  type: 'card.move',
  payload: {},
  createdAt: '2026-10-31T00:00:00Z',
};
it('announces a move only after its exact server receipt, including a no-op move', async () => {
  const { result, rerender, live } = movement();
  await act(() => result.current.move(command));
  expect(result.current.message).toBe(
    'Moving Launch to Backlog. Waiting for server confirmation.',
  );
  rerender({
    live: {
      ...live,
      activity: [{ ...event, clientMutationId: 'another-tab' }],
    },
  });
  expect(result.current.message).toContain('Waiting for server confirmation.');
  rerender({ live: { ...live, activity: [event] } });
  expect(result.current.message).toBe('Moved Launch to Backlog.');
});
it('names the destination on rejected and server-failed moves without announcing success', async () => {
  const { result, rerender, live } = movement();
  await act(() => result.current.move(command));
  rerender({
    live: {
      ...live,
      pending: [
        {
          state: 'failed',
          mutation: { clientMutationId: 'receipt', baseRevision: 1, command },
        },
      ],
    },
  });
  expect(result.current.message).toBe(
    'Move of Launch to Backlog needs review. Your attempted move is preserved.',
  );
  live.mutate = vi
    .fn<ReturnType<typeof useBoard>['mutate']>()
    .mockResolvedValue(false);
  rerender({ live });
  await act(() => result.current.move(command));
  expect(result.current.message).toBe(
    'Could not submit the move of Launch to Backlog. Your input is preserved.',
  );
  expect(result.current.destination('backlog')).toBe(
    'Destination: end of Backlog.',
  );
});
