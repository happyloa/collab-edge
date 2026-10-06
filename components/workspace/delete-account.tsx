'use client';
import { useRef, useState } from 'react';
import { useI18n } from '../ui/i18n';
import { PasswordInput } from '../ui/password-input';
import { ApiErrorNotice } from '../ui/api-error-notice';
import { useHydrated } from '../ui/use-hydrated';
import { api } from '../ui/providers';
import { asError } from '../../src/lib/api-client';

export function DeleteAccount({ ownsWorkspace }: { ownsWorkspace: boolean }) {
  const { t } = useI18n();
  const ready = useHydrated();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState<Error | null>(null);
  return (
    <section className="mt-8 border-t border-border pt-5">
      <button
        type="button"
        className="text-sm text-destructive"
        aria-expanded={open}
        disabled={!ready || busy}
        onClick={() => setOpen((value) => !value)}
      >
        {t('Delete my account')}
      </button>
      {open && (
        <div className="mt-4 space-y-3 text-sm">
          <p className="text-muted">
            {t(
              'Your email, name, password and sessions will be removed. Shared cards, comments and files remain, while your author identity is anonymized. This cannot be undone.',
            )}
          </p>
          {ownsWorkspace ? (
            <p className="notice">
              {t('Transfer ownership of every workspace first.')}
            </p>
          ) : (
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                if (!ready || pending.current || ownsWorkspace) return;
                const password = new FormData(event.currentTarget).get(
                  'password',
                );
                pending.current = true;
                setBusy(true);
                setError(null);
                void (async () => {
                  try {
                    await api('/api/auth/account', {
                      method: 'DELETE',
                      body: JSON.stringify({ password, confirm: true }),
                    });
                    location.replace('/login');
                  } catch (caught) {
                    setError(asError(caught));
                    pending.current = false;
                    setBusy(false);
                  }
                })();
              }}
            >
              <fieldset disabled={!ready || busy} className="space-y-3">
                <div className="field">
                  <label htmlFor="delete-account-password">
                    {t('Confirm with your password')}
                  </label>
                  <PasswordInput
                    id="delete-account-password"
                    name="password"
                    required
                    maxLength={128}
                    autoComplete="current-password"
                  />
                </div>
                <label className="flex items-start gap-2">
                  <input type="checkbox" required className="mt-1 w-auto" />
                  {t('I understand this cannot be undone.')}
                </label>
                <ApiErrorNotice error={error} />
                <button
                  className="button secondary"
                  type="submit"
                  aria-busy={busy}
                >
                  {t('Permanently delete account')}
                </button>
              </fieldset>
            </form>
          )}
        </div>
      )}
    </section>
  );
}
