'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from './ui/providers';
import { useHydrated } from './ui/use-hydrated';
export function DemoEntry() {
  const hydrated = useHydrated();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
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
              try {
                const result = await api<{ boardId: string }>(
                  '/api/auth/demo',
                  { method: 'POST', body: JSON.stringify({ person }) },
                );
                router.push(`/boards/${result.boardId}`);
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : 'Unable to open demo',
                );
                setBusy(false);
              }
            }}
          >
            Try as {person}
          </button>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted">
        Shared public demo · open Bob in a private window to collaborate.
      </p>
      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
