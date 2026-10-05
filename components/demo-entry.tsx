'use client';
import { useI18n } from './ui/i18n';
import { useState } from 'react';
import { api } from './ui/providers';
import { useHydrated } from './ui/use-hydrated';
import { asError } from '../src/lib/api-client';
import { ApiErrorNotice } from './ui/api-error-notice';
export function DemoEntry() {
  const { t } = useI18n();

  const hydrated = useHydrated();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  return (
    <div className="mt-6">
      <div className="flex flex-wrap gap-3">
        {(['Alice', 'Bob'] as const).map((person) => (
          <button
            key={person}
            disabled={busy || !hydrated}
            className="button secondary"
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                const result = await api<{ boardId: string }>(
                  '/api/auth/demo',
                  { method: 'POST', body: JSON.stringify({ person }) },
                );
                location.assign(`/boards/${result.boardId}`);
              } catch (e) {
                setError(asError(e, 'Unable to open demo'));
                setBusy(false);
              }
            }}
          >
            {t('Try as {person}', { person })}
          </button>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted">
        {t('Shared public demo · open Bob in a private window to collaborate.')}
      </p>
      <ApiErrorNotice error={error} className="mt-3" />
    </div>
  );
}
