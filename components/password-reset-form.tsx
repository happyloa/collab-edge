'use client';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { Layers3 } from 'lucide-react';
import { useI18n, LanguageSelect } from './ui/i18n';
import { useHydrated } from './ui/use-hydrated';
import { api } from './ui/providers';

export function PasswordResetForm() {
  const { t, errorText } = useI18n();
  const hydrated = useHydrated();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (password !== confirmation) {
      setError('Passwords do not match');
      return;
    }
    setBusy(true);
    try {
      await api('/api/auth/password-reset', {
        method: 'POST',
        body: JSON.stringify({ password }),
      });
      setPassword('');
      setConfirmation('');
      setDone(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center px-6">
      <div className="motion-reveal w-full max-w-md">
        <Link href="/" className="brand mb-12">
          <Layers3 /> CollabEdge
        </Link>
        <div className="mb-6 flex justify-end">
          <LanguageSelect />
        </div>
        <p className="eyebrow">{t('ACCOUNT RECOVERY')}</p>
        <h1 className="mt-3 text-3xl font-semibold">
          {t('Reset your password')}
        </h1>
        <p className="mt-3 text-muted">
          {t(
            'First verify your email with Cloudflare Access. This resets the CollabEdge account using that same email.',
          )}
        </p>
        {done ? (
          <div role="status" className="notice mt-8 space-y-4">
            <p>
              {t(
                'Password updated. All previous CollabEdge sessions are signed out.',
              )}
            </p>
            <Link href="/login" className="button">
              {t('Sign in')}
            </Link>
          </div>
        ) : (
          <form
            onSubmit={(event) => void submit(event)}
            className="mt-8 space-y-5"
          >
            <label className="field">
              {t('New password')}
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={128}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <label className="field">
              {t('Confirm new password')}
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={128}
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </label>
            {error && (
              <p role="alert" className="notice error">
                {errorText(error)}
              </p>
            )}
            <button className="button w-full" disabled={busy || !hydrated}>
              {t(busy ? 'Just a moment…' : 'Set new password')}
            </button>
          </form>
        )}
        <p className="mt-6 text-center text-sm">
          <Link href="/login" className="text-primary">
            {t('Back to sign in')}
          </Link>
        </p>
      </div>
    </main>
  );
}
