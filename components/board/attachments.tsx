'use client';
import { useState } from 'react';
import { api } from '../ui/providers';
import type { Snapshot } from '../../src/realtime/protocol';
export function Attachments({
  cardId,
  items,
  readOnly,
}: {
  cardId: string;
  items: Snapshot['attachments'];
  readOnly: boolean;
}) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <section className="mt-8 border-t border-border pt-6">
      <h2 className="font-semibold">Attachments</h2>
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
                      setError(
                        e instanceof Error ? e.message : 'Delete failed',
                      );
                    }
                  }}
                >
                  Remove
                </button>
              )}
            </li>
          ))}
      </ul>
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {!readOnly && (
        <label className="field">
          Upload a file
          <input
            type="file"
            disabled={busy}
            accept="image/png,image/jpeg,image/webp,application/pdf,text/plain"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setBusy(true);
              setError('');
              try {
                if (file.size > 10 * 1024 * 1024)
                  throw new Error('Maximum file size is 10 MB');
                const response = await fetch(
                  `/api/cards/${cardId}/attachments`,
                  {
                    method: 'POST',
                    headers: {
                      'Content-Type': file.type,
                      'X-Filename': encodeURIComponent(file.name),
                    },
                    body: file,
                  },
                );
                if (!response.ok) {
                  const result = (await response.json()) as { error: string };
                  throw new Error(result.error);
                }
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Upload failed');
              } finally {
                setBusy(false);
              }
            }}
          />
          <span className="text-xs text-muted">
            PNG, JPEG, WebP, PDF or text · 10 MB each · 10 files per card
          </span>
        </label>
      )}
    </section>
  );
}
