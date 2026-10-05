'use client';
import { useI18n } from '../ui/i18n';
import { useState } from 'react';
import { api } from '../ui/providers';
import type { Snapshot } from '../../src/realtime/protocol';
import { asError } from '../../src/lib/api-client';
import { ApiErrorNotice } from '../ui/api-error-notice';
export function Attachments({
  cardId,
  items,
  references = [],
  readOnly,
}: {
  cardId: string;
  items: Snapshot['attachments'];
  references?: Snapshot['attachmentReferences'];
  readOnly: boolean;
}) {
  const { t } = useI18n();

  const [error, setError] = useState<Error | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <section className="mt-8 border-t border-border pt-6">
      <h2 className="font-semibold">{t('Attachments')}</h2>
      <ul className="my-4 space-y-3">
        {items
          .filter((a) => a.cardId === cardId)
          .map((a) => (
            <li
              key={a.id}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <a
                className="text-primary underline"
                href={`/api/attachments/${a.id}`}
              >
                {a.filename}
              </a>
              {!readOnly && (
                <button
                  className="text-xs text-destructive"
                  onClick={async () => {
                    try {
                      await api(`/api/attachments/${a.id}`, {
                        method: 'DELETE',
                      });
                    } catch (e) {
                      setError(asError(e, 'Delete failed'));
                    }
                  }}
                >
                  {t('Remove')}
                </button>
              )}
            </li>
          ))}
      </ul>
      {references.some((item) => item.cardId === cardId) && (
        <div className="mb-4 text-sm">
          <p className="text-muted">
            {t(
              'Backup file references only. Original files are not available for download.',
            )}
          </p>
          <ul className="mt-3 space-y-2">
            {references
              .filter((item) => item.cardId === cardId)
              .map((item) => (
                <li key={item.id} className="rounded-lg bg-background p-3">
                  <span className="break-all">{item.filename}</span>
                  <span className="ml-2 text-xs text-muted">
                    {t('{bytes} bytes · File unavailable', {
                      bytes: item.size,
                    })}
                  </span>
                </li>
              ))}
          </ul>
        </div>
      )}
      <ApiErrorNotice error={error} />
      {!readOnly && (
        <label className="field">
          {t('Upload a file')}
          <input
            type="file"
            disabled={busy}
            accept="image/png,image/jpeg,image/webp,application/pdf,text/plain"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setBusy(true);
              setError(null);
              try {
                if (file.size > 10 * 1024 * 1024)
                  throw new Error('Maximum file size is 10 MB');
                await api(`/api/cards/${cardId}/attachments`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': file.type,
                    'X-Filename': encodeURIComponent(file.name),
                  },
                  body: file,
                });
              } catch (e) {
                setError(asError(e, 'Upload failed'));
              } finally {
                setBusy(false);
              }
            }}
          />
          <span className="text-xs text-muted">
            {t('PNG, JPEG, WebP, PDF or text · 10 MB each · 10 files per card')}
          </span>
        </label>
      )}
    </section>
  );
}
