'use client';
import { useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { api } from '../ui/providers';
import { ApiErrorNotice } from '../ui/api-error-notice';
import { useI18n } from '../ui/i18n';
import type { BoardEvent } from '../../src/realtime/protocol';
import { HistoryMaintenance } from './history-maintenance';
import { DEMO } from '../../src/db/demo';

type ActivityPage = {
  events: BoardEvent[];
  nextBefore: number | null;
  prunedThroughRevision: number;
};

export function ActivityPanel({
  boardId,
  open,
  liveEvents,
  isOwner,
  canOperate,
}: {
  boardId: string;
  open: boolean;
  liveEvents: BoardEvent[];
  isOwner: boolean;
  canOperate: boolean;
}) {
  const { t, locale } = useI18n();
  const history = useInfiniteQuery({
    queryKey: ['activity', boardId],
    enabled: open,
    initialPageParam: undefined as number | undefined,
    queryFn: ({ pageParam, signal }) =>
      api<ActivityPage>(
        `/api/boards/${boardId}/activity?limit=30${pageParam === undefined ? '' : `&before=${pageParam}`}`,
        { signal },
      ),
    getNextPageParam: (lastPage) => lastPage.nextBefore ?? undefined,
  });
  const activity = useMemo(
    () =>
      [
        ...new Map(
          [
            ...(history.data?.pages.flatMap((page) => page.events) ?? []),
            ...liveEvents,
          ].map((event) => [event.eventId, event]),
        ).values(),
      ].sort((a, b) => b.revision - a.revision),
    [history.data, liveEvents],
  );
  if (!open) return null;
  return (
    <section
      aria-labelledby="board-activity-title"
      className="surface motion-reveal p-6"
    >
      <h2 id="board-activity-title" className="font-semibold">
        {t('Recent activity')}
      </h2>
      {!!history.data?.pages[0]?.prunedThroughRevision && (
        <p className="mt-3 text-sm text-muted">
          {t(
            'Some older activity details have been cleared. Current board data is preserved.',
          )}
        </p>
      )}
      {history.isPending && (
        <p role="status" className="mt-3 text-sm text-muted">
          {t('Loading activity…')}
        </p>
      )}
      <ApiErrorNotice
        error={history.error}
        className="mt-3"
        retryLabel="Retry activity"
        onRetry={() => {
          if (history.isFetchNextPageError) void history.fetchNextPage();
          else void history.refetch();
        }}
      />
      {!history.isPending && !history.error && activity.length === 0 && (
        <p className="mt-3 text-sm text-muted">
          {t('Board updates will appear here.')}
        </p>
      )}
      <ol className="mt-3 space-y-3">
        {activity.map((event) => (
          <li key={event.eventId} className="motion-reveal flex gap-4 text-sm">
            <span className="text-muted">#{event.revision}</span>
            <span>
              {locale === 'en' ? event.type.replace('.', ' · ') : t(event.type)}
            </span>
            <time className="ml-auto text-xs text-muted">
              {new Date(event.createdAt).toLocaleTimeString(locale)}
            </time>
          </li>
        ))}
      </ol>
      {history.hasNextPage && !history.error && (
        <button
          className="button secondary mt-4"
          disabled={history.isFetchingNextPage}
          onClick={() => void history.fetchNextPage()}
        >
          {history.isFetchingNextPage
            ? t('Loading older activity…')
            : t('Load older activity')}
        </button>
      )}
      {isOwner && boardId !== DEMO.board && (
        <HistoryMaintenance boardId={boardId} canOperate={canOperate} />
      )}
    </section>
  );
}
