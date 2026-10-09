'use client';
import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../ui/providers';
import { ApiErrorNotice } from '../ui/api-error-notice';
import { useI18n } from '../ui/i18n';
import { useHydrated } from '../ui/use-hydrated';
import { ApiError } from '../../src/lib/api-client';
import type { HistoryRetention } from '../../src/boards/retention';

export function HistoryMaintenance({
  boardId,
  canOperate,
}: {
  boardId: string;
  canOperate: boolean;
}) {
  const { t, locale } = useI18n();
  const ready = useHydrated();
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const [error, setError] = useState<unknown>(null);
  const [completed, setCompleted] = useState(false);
  const key = ['board', boardId, 'retention'];
  const history = useQuery({
    queryKey: key,
    queryFn: ({ signal }) =>
      api<HistoryRetention>(`/api/boards/${boardId}/retention`, { signal }),
    enabled: open && canOperate,
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  function refresh() {
    if (pendingRef.current || !canOperate) return;
    setConfirmed(false);
    setError(null);
    setCompleted(false);
    void history.refetch();
  }
  async function prune() {
    const data = history.data;
    if (
      !ready ||
      pendingRef.current ||
      history.isFetching ||
      !canOperate ||
      !confirmed ||
      !data?.batch
    )
      return;
    pendingRef.current = true;
    setPending(true);
    setError(null);
    setCompleted(false);
    try {
      const result = await api<HistoryRetention>(
        `/api/boards/${boardId}/retention`,
        {
          method: 'POST',
          body: JSON.stringify({
            boardId,
            expectedRevision: data.revision,
            before: data.before,
            batch: data.batch,
          }),
        },
      );
      client.setQueryData(key, result);
      setConfirmed(false);
      setCompleted(true);
      await client.invalidateQueries({ queryKey: ['activity', boardId] });
    } catch (failure) {
      setError(failure);
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }
  const blocked = !ready || !canOperate || pending || history.isFetching;
  return (
    <section
      className="mt-6 border-t border-border pt-5"
      aria-label={t('History maintenance')}
    >
      <button
        type="button"
        className="button secondary"
        disabled={!ready || pending || !canOperate}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {t('Manage history')}
      </button>
      {open && (
        <div className="mt-4 space-y-4 text-sm">
          <p className="text-muted">
            {t(
              'Only event details older than 30 days can be cleared. The latest 200 changes remain available.',
            )}
          </p>
          <p className="text-muted">
            {t(
              'Board data, retry receipts and lifetime quotas stay unchanged. This does not reset capacity.',
            )}
          </p>
          <p className="text-muted">
            {t(
              'Each request clears at most 100 details. A retry targets the same reviewed batch.',
            )}
          </p>
          {!canOperate && (
            <p role="status">
              {t('Connect and finish pending edits before managing history.')}
            </p>
          )}
          {history.isPending && canOperate && (
            <p role="status">{t('Loading history maintenance…')}</p>
          )}
          <ApiErrorNotice
            error={history.error}
            onRetry={refresh}
            retryLabel="Refresh history preview"
          />
          {history.data && !history.error && (
            <>
              <dl className="grid gap-3 sm:grid-cols-2">
                <div>
                  <dt className="text-muted">{t('Eligible event details')}</dt>
                  <dd className="mt-1 font-semibold">
                    {history.data.eligibleEvents.toLocaleString(locale)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">{t('Eligible payload size')}</dt>
                  <dd className="mt-1 font-semibold">
                    {t('{bytes} bytes', {
                      bytes: history.data.eligibleBytes.toLocaleString(locale),
                    })}
                  </dd>
                </div>
              </dl>
              <p className="text-xs text-muted">
                {t('Preview revision {revision} · Before {time}', {
                  revision: history.data.revision,
                  time: new Date(history.data.before).toLocaleString(locale),
                })}
              </p>
              {history.data.batch ? (
                <>
                  <label className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1 w-auto"
                      checked={confirmed}
                      disabled={blocked}
                      onChange={(e) => setConfirmed(e.target.checked)}
                    />
                    <span>
                      {t(
                        'I understand that cleared activity details cannot be recovered from a board JSON backup.',
                      )}
                    </span>
                  </label>
                  <button
                    type="button"
                    className="button"
                    disabled={blocked || !confirmed}
                    aria-busy={pending}
                    onClick={() => void prune()}
                  >
                    {pending
                      ? t('Clearing history…')
                      : t('Clear reviewed batch')}
                  </button>
                </>
              ) : (
                <p>{t('No event details are eligible for clearing.')}</p>
              )}
              <button
                type="button"
                className="button secondary"
                disabled={blocked}
                onClick={refresh}
              >
                {t('Refresh history preview')}
              </button>
            </>
          )}
          <ApiErrorNotice
            error={error}
            onRetry={
              error instanceof ApiError && error.status === 409
                ? refresh
                : () => void prune()
            }
            retryLabel={
              error instanceof ApiError && error.status === 409
                ? 'Refresh history preview'
                : 'Retry reviewed batch'
            }
          />
          {completed && (
            <p role="status" className="text-success">
              {t(
                'Batch completed. Review the remaining details before continuing.',
              )}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
