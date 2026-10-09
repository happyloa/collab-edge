import '@testing-library/jest-dom/vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ActivityPanel } from '../components/board/activity-panel';
import { Providers } from '../components/ui/providers';
import type { BoardEvent } from '../src/realtime/protocol';

const boardId = '00000000-0000-4000-8000-000000000001';
function event(revision: number): BoardEvent {
  return {
    boardId,
    revision,
    eventId: `00000000-0000-4000-8000-${String(revision).padStart(12, '0')}`,
    clientMutationId: crypto.randomUUID(),
    actorId: boardId,
    type: 'card.create',
    payload: {},
    createdAt: '2026-10-06T00:00:00Z',
  };
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('fetches only when opened and keeps deduplicated history during next-page failure and retry', async () => {
  const first = event(3),
    overlap = event(2),
    older = event(1),
    newest = event(4);
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({ events: [first, overlap], nextBefore: 2 }),
    )
    .mockResolvedValueOnce(
      Response.json(
        {
          error: 'Too many requests. Please wait before trying again.',
          code: 'RATE_LIMITED',
        },
        { status: 429 },
      ),
    )
    .mockResolvedValueOnce(
      Response.json({ events: [overlap, older], nextBefore: null }),
    );
  vi.stubGlobal('fetch', fetch);
  const liveEvents = [overlap, newest];
  const content = (open: boolean) => (
    <Providers>
      <ActivityPanel
        boardId={boardId}
        open={open}
        liveEvents={liveEvents}
        isOwner={false}
        canOperate={true}
      />
    </Providers>
  );
  const { rerender } = render(content(false));
  await act(async () => {});
  expect(fetch).not.toHaveBeenCalled();
  expect(screen.queryByRole('region')).not.toBeInTheDocument();
  rerender(content(true));
  const panel = await screen.findByRole('region', { name: 'Recent activity' });
  await waitFor(() =>
    expect(within(panel).getAllByRole('listitem')).toHaveLength(3),
  );
  expect(
    within(panel)
      .getAllByRole('listitem')
      .map((item) => item.textContent?.match(/#\d+/)?.[0]),
  ).toEqual(['#4', '#3', '#2']);
  fireEvent.click(screen.getByRole('button', { name: 'Load older activity' }));
  await screen.findByRole('alert');
  expect(within(panel).getAllByRole('listitem')).toHaveLength(3);
  expect(fetch).toHaveBeenCalledTimes(2);
  fireEvent.click(screen.getByRole('button', { name: 'Retry activity' }));
  await waitFor(() =>
    expect(within(panel).getAllByRole('listitem')).toHaveLength(4),
  );
  expect(fetch.mock.calls.map(([url]) => url)).toEqual([
    `/api/boards/${boardId}/activity?limit=30`,
    `/api/boards/${boardId}/activity?limit=30&before=2`,
    `/api/boards/${boardId}/activity?limit=30&before=2`,
  ]);
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Load older activity' }),
  ).not.toBeInTheDocument();
  rerender(content(false));
  rerender(content(true));
  await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(4));
  expect(fetch).toHaveBeenCalledTimes(3);
});
