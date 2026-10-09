import '@testing-library/jest-dom/vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { HistoryMaintenance } from '../components/board/history-maintenance';
import { Providers } from '../components/ui/providers';
import type { HistoryRetention } from '../src/boards/retention';

const boardId = '00000000-0000-4000-8000-000000000001';
const preview: HistoryRetention = {
  boardId,
  revision: 360,
  before: '2026-09-09T00:00:00.000Z',
  eligibleEvents: 160,
  eligibleBytes: 32000,
  prunedEvents: 0,
  prunedThroughRevision: 0,
  recentEvents: 200,
  retentionDays: 30,
  batchSize: 100,
  batch: { afterRevision: 0, throughRevision: 100 },
};
const next: HistoryRetention = {
  ...preview,
  eligibleEvents: 60,
  eligibleBytes: 12000,
  prunedEvents: 100,
  prunedThroughRevision: 100,
  batch: { afterRevision: 100, throughRevision: 160 },
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
async function open() {
  fireEvent.click(
    await screen.findByRole('button', { name: 'Manage history' }),
  );
  await screen.findByRole('checkbox');
}
function confirmAndClear() {
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'Clear reviewed batch' }));
}

it('fetches on demand and requires a fresh confirmation for each completed batch', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(Response.json(preview))
    .mockResolvedValueOnce(Response.json(next));
  vi.stubGlobal('fetch', fetch);
  render(
    <Providers>
      <HistoryMaintenance boardId={boardId} canOperate />
    </Providers>,
  );
  await act(async () => {});
  expect(fetch).not.toHaveBeenCalled();
  await open();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(
    screen.getByRole('button', { name: 'Clear reviewed batch' }),
  ).toBeDisabled();
  confirmAndClear();
  await screen.findByText(
    'Batch completed. Review the remaining details before continuing.',
  );
  expect(screen.getByRole('checkbox')).not.toBeChecked();
  expect(
    screen.getByRole('button', { name: 'Clear reviewed batch' }),
  ).toBeDisabled();
  expect(fetch).toHaveBeenCalledTimes(2);
  fireEvent.click(screen.getByRole('button', { name: 'Manage history' }));
  fireEvent.click(screen.getByRole('button', { name: 'Manage history' }));
  await act(async () => {});
  expect(fetch).toHaveBeenCalledTimes(2);
});

it('keeps the reviewed batch and confirmation after a lost response, blocks double submission and retries identical input', async () => {
  let rejectRequest!: (error: Error) => void;
  const lost = new Promise<Response>((_, reject) => {
    rejectRequest = reject;
  });
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(Response.json(preview))
    .mockReturnValueOnce(lost)
    .mockResolvedValueOnce(Response.json(next));
  vi.stubGlobal('fetch', fetch);
  render(
    <Providers>
      <HistoryMaintenance boardId={boardId} canOperate />
    </Providers>,
  );
  await open();
  confirmAndClear();
  fireEvent.click(screen.getByRole('button', { name: 'Clearing history…' }));
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(screen.getByRole('checkbox')).toBeDisabled();
  expect(
    screen.getByRole('button', { name: 'Refresh history preview' }),
  ).toBeDisabled();
  await act(async () => {
    rejectRequest(new TypeError('Failed to fetch'));
  });
  await screen.findByRole('alert');
  expect(screen.getByRole('checkbox')).toBeChecked();
  fireEvent.click(screen.getByRole('button', { name: 'Retry reviewed batch' }));
  await screen.findByText(
    'Batch completed. Review the remaining details before continuing.',
  );
  expect(fetch).toHaveBeenCalledTimes(3);
  expect(fetch.mock.calls[1][1].body).toBe(fetch.mock.calls[2][1].body);
  expect(JSON.parse(fetch.mock.calls[2][1].body)).toEqual({
    boardId,
    expectedRevision: 360,
    before: preview.before,
    batch: preview.batch,
  });
});

it('refreshes a changed board after a conflict without automatically sending a new batch', async () => {
  const changed = { ...preview, revision: 361 };
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(Response.json(preview))
    .mockResolvedValueOnce(
      Response.json(
        {
          error: 'Board changed. Refresh history maintenance and review again.',
          code: 'CONFLICT',
        },
        { status: 409 },
      ),
    )
    .mockResolvedValueOnce(Response.json(changed));
  vi.stubGlobal('fetch', fetch);
  render(
    <Providers>
      <HistoryMaintenance boardId={boardId} canOperate />
    </Providers>,
  );
  await open();
  confirmAndClear();
  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent(
    'Board changed. Refresh history maintenance and review again.',
  );
  // The error retry refreshes the preview instead of retrying an obsolete write.
  fireEvent.click(
    screen.getAllByRole('button', { name: 'Refresh history preview' }).at(-1)!,
  );
  await waitFor(() =>
    expect(screen.getByText(/Preview revision 361/)).toBeInTheDocument(),
  );
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.getByRole('checkbox')).not.toBeChecked();
  expect(
    screen.getByRole('button', { name: 'Clear reviewed batch' }),
  ).toBeDisabled();
  expect(
    fetch.mock.calls.filter(([, init]) => init.method === 'POST'),
  ).toHaveLength(1);
});

it('blocks maintenance while disconnected or while edits are pending and does not poll on reconnect', async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json(preview));
  vi.stubGlobal('fetch', fetch);
  const content = (canOperate: boolean) => (
    <Providers>
      <HistoryMaintenance boardId={boardId} canOperate={canOperate} />
    </Providers>
  );
  const { rerender } = render(content(false));
  expect(screen.getByRole('button', { name: 'Manage history' })).toBeDisabled();
  rerender(content(true));
  await open();
  fireEvent.click(screen.getByRole('checkbox'));
  rerender(content(false));
  expect(screen.getByRole('checkbox')).toBeDisabled();
  expect(
    screen.getByRole('button', { name: 'Clear reviewed batch' }),
  ).toBeDisabled();
  expect(screen.getByRole('status')).toHaveTextContent(
    'Connect and finish pending edits',
  );
  rerender(content(true));
  await act(async () => {});
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('shows the empty preview and server errors in Traditional Chinese', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json(
        {
          error: 'Only the workspace owner can manage board history.',
          code: 'FORBIDDEN',
        },
        { status: 403 },
      ),
    )
    .mockResolvedValueOnce(
      Response.json({
        ...preview,
        eligibleEvents: 0,
        eligibleBytes: 0,
        batch: null,
      }),
    );
  vi.stubGlobal('fetch', fetch);
  render(
    <Providers locale="zh-TW">
      <HistoryMaintenance boardId={boardId} canOperate />
    </Providers>,
  );
  fireEvent.click(await screen.findByRole('button', { name: '管理歷史紀錄' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    '只有工作區擁有者能管理看板歷史紀錄。',
  );
  fireEvent.click(screen.getByRole('button', { name: '重新讀取清理預覽' }));
  await screen.findByText('目前沒有符合條件的事件內容。');
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: '清除已預覽的批次' }),
  ).not.toBeInTheDocument();
});
