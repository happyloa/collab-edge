'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useI18n } from '../ui/i18n';
import { api } from '../ui/providers';
import { ApiErrorNotice } from '../ui/api-error-notice';
import type { WorkspaceUsage } from '../../src/workspaces/usage';

function Capacity({
  label,
  value,
}: {
  label: string;
  value: { used: number; limit: number };
}) {
  const { t } = useI18n();
  return (
    <div className="space-y-1">
      <div className="flex justify-between gap-4 text-sm">
        <dt>{label}</dt>
        <dd className={value.used >= value.limit ? 'text-destructive' : ''}>
          {value.used} / {value.limit}
          {value.used >= value.limit && (
            <span className="ml-2">{t('Limit reached')}</span>
          )}
        </dd>
      </div>
      <meter
        className="w-full"
        aria-label={label}
        min={0}
        max={value.limit}
        value={value.used}
      />
    </div>
  );
}

export function Usage({ workspaceId }: { workspaceId: string }) {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const usage = useQuery({
    queryKey: ['workspace', workspaceId, 'usage'],
    queryFn: ({ signal }) =>
      api<WorkspaceUsage>(`/api/workspaces/${workspaceId}/usage`, { signal }),
    enabled: open,
    staleTime: 60000,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  return (
    <section
      className="mt-8 border-t border-border pt-5"
      aria-label={t('Capacity and limits')}
    >
      <button
        type="button"
        className="button secondary"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {t('Capacity and limits')}
      </button>
      {open && (
        <div className="mt-4 space-y-4">
          <p className="text-sm text-muted">
            {t(
              'Archiving keeps data and does not free capacity. Shared server budgets can also prevent changes.',
            )}
          </p>
          {usage.isPending && <p role="status">{t('Loading capacity…')}</p>}
          <ApiErrorNotice
            error={usage.error}
            onRetry={() => void usage.refetch()}
          />
          {usage.data && !usage.isError && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
                <p>
                  {t('Measured at {time}', {
                    time: new Date(usage.data.measuredAt).toLocaleString(
                      locale,
                    ),
                  })}
                </p>
                <button
                  type="button"
                  className="button secondary"
                  disabled={usage.isFetching}
                  onClick={() => void usage.refetch()}
                >
                  {t('Refresh capacity')}
                </button>
              </div>
              <dl className="grid gap-4 sm:grid-cols-2">
                <Capacity
                  label={t('Workspace members')}
                  value={usage.data.members}
                />
                <Capacity
                  label={t('Workspace boards')}
                  value={usage.data.boards}
                />
              </dl>
              {!usage.data.attachmentsEnabled && (
                <p className="text-sm text-muted">
                  {t('Attachments are disabled in this environment.')}
                </p>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                {usage.data.boardUsage.map((board) => (
                  <article className="surface p-4" key={board.id}>
                    <h2 className="font-semibold">
                      {board.name}
                      {board.archived && (
                        <span className="ml-2 text-xs text-muted">
                          {t('Archived')}
                        </span>
                      )}
                    </h2>
                    <dl className="mt-4 space-y-3">
                      <Capacity label={t('Columns')} value={board.columns} />
                      <Capacity label={t('Cards')} value={board.cards} />
                      <Capacity
                        label={t('Most comments on one card')}
                        value={board.busiestCardComments}
                      />
                      <Capacity
                        label={t('Accepted board changes')}
                        value={board.changes}
                      />
                    </dl>
                    <p className="mt-3 text-xs text-muted">
                      {t(
                        '{archived} archived cards · {comments} comments total',
                        {
                          archived: board.archivedCards,
                          comments: board.commentCount,
                        },
                      )}
                    </p>
                  </article>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
