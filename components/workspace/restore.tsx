'use client';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Upload } from 'lucide-react';
import { api } from '../ui/providers';
import { useI18n } from '../ui/i18n';
import { ApiErrorNotice } from '../ui/api-error-notice';
import { asError } from '../../src/lib/api-client';
import {
  BACKUP_LIMITS,
  parseBoardBackup,
  type BoardBackup,
} from '../../src/backups/format';
import { prepareRestore, restoreChunks } from '../../src/backups/transfer';
import type { RestoreStatus } from '../../src/backups/restore';

type Prepared = {
  backup: BoardBackup;
  transfer: Awaited<ReturnType<typeof prepareRestore>>;
};
export function Restore({
  workspaceId,
  members,
}: {
  workspaceId: string;
  members: { userId: string; name: string }[];
}) {
  const { t, locale } = useI18n();
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<Prepared | null>(null);
  const [assignees, setAssignees] = useState<Record<string, string | null>>({});
  const [job, setJob] = useState<RestoreStatus | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [busy, setBusy] = useState(false);
  const [cleaned, setCleaned] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  // Keep the same id after an uncertain start response. The server will return
  // that receipt rather than creating a second board.
  const attempt = useRef<string | null>(null);
  const active = useQuery({
    queryKey: ['workspace', workspaceId, 'restore'],
    queryFn: async ({ signal }) =>
      (
        await api<{ job: RestoreStatus | null }>(
          `/api/workspaces/${workspaceId}/restores`,
          {
            signal,
          },
        )
      ).job,
    enabled: open,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: 60_000,
  });
  const current = job ?? active.data;
  const sameSource =
    !current || (source?.transfer.root === current.root && current.canResume);
  const sourceAssignees = [
    ...new Set(
      source?.backup.snapshot.cards.flatMap((card) =>
        card.assigneeId ? [card.assigneeId] : [],
      ) ?? [],
    ),
  ];

  async function refreshWorkspaces() {
    await client.invalidateQueries({
      queryKey: ['workspace', workspaceId],
      refetchType: 'none',
    });
    await client.invalidateQueries({
      queryKey: ['workspace', workspaceId],
      exact: true,
    });
  }
  async function cleanup(receipt: RestoreStatus) {
    for (let page = 0; page <= Math.ceil(BACKUP_LIMITS.items / 500); page++) {
      const result = await api<{ done: boolean }>(
        `/api/restore-jobs/${receipt.id}`,
        { method: 'POST', body: JSON.stringify({ action: 'cleanup' }) },
      );
      if (result.done) {
        setCleaned(true);
        if (receipt.state === 'cancelled') {
          setJob(null);
          attempt.current = null;
          setConfirmed(false);
          client.setQueryData(['workspace', workspaceId, 'restore'], null);
        }
        return;
      }
    }
    throw new Error('Temporary backup cleanup is incomplete. Try again.');
  }
  async function operate(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(asError(caught));
    } finally {
      setBusy(false);
    }
  }
  async function restore() {
    if (!source || !confirmed) return;
    await operate(async () => {
      let receipt =
        job ??
        (
          await api<{ job: RestoreStatus | null }>(
            `/api/workspaces/${workspaceId}/restores`,
          )
        ).job;
      if (!receipt) {
        attempt.current ??= crypto.randomUUID();
        receipt = await api<RestoreStatus>(
          `/api/workspaces/${workspaceId}/restores`,
          {
            method: 'POST',
            body: JSON.stringify({
              jobId: attempt.current,
              root: source.transfer.root,
              header: source.transfer.header,
              proof: source.transfer.proof,
              assignees,
            }),
          },
        );
      } else {
        receipt = await api<RestoreStatus>(`/api/restore-jobs/${receipt.id}`);
      }
      setJob(receipt);
      if (receipt.root !== source.transfer.root)
        throw new Error(
          'Select the original backup file to resume this restore.',
        );
      if (receipt.state === 'uploading') {
        if (!receipt.canResume)
          throw new Error(
            'This restore has expired or belongs to another account. Cancel it before starting again.',
          );
        // The server requires a contiguous prefix, so received is a safe resume
        // cursor even if the last successful upload response was lost.
        const received = receipt.received;
        for (const items of restoreChunks(
          source.transfer.items.filter((item) => item.index > received),
        )) {
          receipt = await api<RestoreStatus>(
            `/api/restore-jobs/${receipt.id}`,
            { method: 'PATCH', body: JSON.stringify({ items }) },
          );
          setJob(receipt);
        }
        receipt = await api<RestoreStatus>(`/api/restore-jobs/${receipt.id}`, {
          method: 'POST',
          body: JSON.stringify({ action: 'complete' }),
        });
        setJob(receipt);
      }
      if (receipt.state !== 'complete')
        throw new Error(
          'Cancel this restore and clean up its temporary data before starting again.',
        );
      await refreshWorkspaces();
      await cleanup(receipt);
    });
  }
  return (
    <section className="surface mt-6 p-5">
      <button
        type="button"
        className="flex items-center gap-2 text-sm font-semibold"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Upload size={16} />
        {t('Restore a board backup')}
      </button>
      {open && (
        <div className="mt-5 space-y-4">
          <p className="text-sm text-muted">
            {t(
              'Creates a separate board in this workspace. Existing boards stay unchanged. Attachment files and previous activity are not included.',
            )}
          </p>
          <ApiErrorNotice
            error={active.error}
            onRetry={() => void active.refetch()}
          />
          {active.isPending && (
            <p role="status">{t('Checking pending restores…')}</p>
          )}
          {current && (
            <div
              className="rounded-lg border border-border p-4 text-sm"
              role="status"
            >
              <p className="font-medium">{current.header.name}</p>
              <p>
                {t('Uploaded {received} of {expected} records.', {
                  received: current.received,
                  expected: current.expected,
                })}
              </p>
              {current.state === 'uploading' && (
                <>
                  <progress
                    className="mt-2 w-full"
                    value={current.received}
                    max={Math.max(1, current.expected)}
                    aria-label={t('Backup upload progress')}
                  />
                  <p>
                    {t(
                      'Resume before {date} with the same file. The original assignee choices are retained.',
                      {
                        date: new Date(current.expiresAt).toLocaleString(
                          locale,
                        ),
                      },
                    )}
                  </p>
                </>
              )}
              {current.state === 'complete' && (
                <p className="mt-2">
                  <Link
                    href={`/boards/${current.boardId}`}
                    className="text-primary underline"
                  >
                    {t('Open restored board')}
                  </Link>
                </p>
              )}
              {current.state !== 'uploading' && !cleaned && (
                <button
                  type="button"
                  className="button secondary mt-3"
                  disabled={busy}
                  onClick={() => void operate(() => cleanup(current))}
                >
                  {t('Clean up temporary backup data')}
                </button>
              )}
              {current.state === 'uploading' && (
                <button
                  type="button"
                  className="button secondary mt-3"
                  disabled={busy}
                  onClick={() =>
                    void operate(async () => {
                      const cancelled = await api<RestoreStatus>(
                        `/api/restore-jobs/${current.id}`,
                        { method: 'DELETE' },
                      );
                      setJob(cancelled);
                      setCleaned(false);
                      await cleanup(cancelled);
                    })
                  }
                >
                  {t('Cancel pending restore')}
                </button>
              )}
            </div>
          )}
          {current?.state !== 'complete' && (
            <>
              <label className="field">
                {t('Board backup file')}
                <input
                  type="file"
                  accept=".json,application/json"
                  disabled={busy || active.isPending || !!active.error}
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    if (!file) return;
                    void operate(async () => {
                      setSource(null);
                      setConfirmed(false);
                      if (file.size > BACKUP_LIMITS.fileBytes)
                        throw new Error('Backup file exceeds 96 MiB.');
                      let data: unknown;
                      try {
                        data = JSON.parse(await file.text());
                      } catch {
                        throw new Error(
                          'Select a valid CollabEdge JSON backup.',
                        );
                      }
                      let backup: BoardBackup;
                      try {
                        backup = await parseBoardBackup(data);
                      } catch {
                        throw new Error(
                          'Backup is invalid, damaged or exceeds board limits.',
                        );
                      }
                      const transfer = await prepareRestore(backup);
                      // Validate request sizes before any server writes.
                      restoreChunks(transfer.items);
                      setSource({ backup, transfer });
                      setAssignees({});
                      if (!current) attempt.current = null;
                      setCleaned(false);
                    });
                  }}
                />
              </label>
              {source && (
                <div className="space-y-4 text-sm">
                  <p className="font-semibold">
                    {source.backup.snapshot.board.name}
                  </p>
                  <p>
                    {t(
                      '{columns} columns · {cards} cards · {comments} comments · {files} file references',
                      {
                        ...source.transfer.header.counts,
                        files: source.transfer.header.counts.attachments,
                      },
                    )}
                  </p>
                  <p className="text-muted">
                    {t(
                      source.backup.format === 'collabedge.board.v2'
                        ? 'Checksum verified. This detects file changes, not the identity of its author.'
                        : 'Legacy backup: no checksum is available. Restore only files you trust.',
                    )}
                  </p>
                  <p className="text-muted">
                    {t(
                      'Imported comments show the author name from the file as unverified history. File references cannot be downloaded.',
                    )}
                  </p>
                  {!current &&
                    sourceAssignees.map((sourceId) => (
                      <label key={sourceId} className="field">
                        {t('Assign imported tasks from {name}', {
                          name:
                            source.backup.people.find(
                              (person) => person.id === sourceId,
                            )?.name ?? t('Former member'),
                        })}
                        <select
                          value={assignees[sourceId] ?? ''}
                          disabled={busy}
                          onChange={(event) =>
                            setAssignees((previous) => ({
                              ...previous,
                              [sourceId]: event.target.value || null,
                            }))
                          }
                        >
                          <option value="">{t('Unassigned')}</option>
                          {members.map((member) => (
                            <option key={member.userId} value={member.userId}>
                              {member.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                  {!sameSource && (
                    <p className="notice">
                      {t(
                        'Select the original backup file to resume this restore.',
                      )}
                    </p>
                  )}
                  <label className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      className="mt-1 w-auto"
                      checked={confirmed}
                      disabled={busy}
                      onChange={(event) => setConfirmed(event.target.checked)}
                    />
                    {t(
                      'I understand this creates a new board and uses the workspace capacity.',
                    )}
                  </label>
                  <button
                    type="button"
                    className="button"
                    disabled={
                      busy || !confirmed || !sameSource || !!active.error
                    }
                    aria-busy={busy}
                    onClick={() => void restore()}
                  >
                    {t(current ? 'Resume restore' : 'Restore as new board')}
                  </button>
                </div>
              )}
            </>
          )}
          <p className="text-xs text-muted">
            {t(
              'Imported copies share a 64 MiB lifetime payload budget across the site. Archiving a board does not reset it.',
            )}{' '}
            {t(
              'One restore at a time across the site. Temporary data is limited to 80 MiB and seven days. Usage limits can pause a large restore; keep your file and retry after the limit resets.',
            )}
          </p>
          <ApiErrorNotice error={error} />
          {busy && (
            <p role="status" className="text-sm text-muted">
              {t('Processing backup… Keep this page open.')}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
