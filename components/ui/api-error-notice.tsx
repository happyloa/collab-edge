'use client';
import { useEffect, useState } from 'react';
import { ApiError } from '../../src/lib/api-client';
import { useI18n } from './i18n';

export function ApiErrorNotice({
  error,
  onRetry,
  retryLabel = 'Try again',
  className = '',
}: {
  error: unknown;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}) {
  const { t, errorText } = useI18n();
  const [now, setNow] = useState(() => Date.now());
  const retryAt = error instanceof ApiError ? error.retryAt : null;
  useEffect(() => {
    if (retryAt === null) return;
    const timer = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= retryAt) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [retryAt]);
  if (!error) return null;
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : 'Request failed';
  const needsSignIn =
    error instanceof ApiError &&
    ['UNAUTHENTICATED', 'ACCESS_REQUIRED'].includes(error.code);
  const remaining =
    retryAt === null ? 0 : Math.max(0, Math.ceil((retryAt - now) / 1000));
  return (
    <div role="alert" className={`notice error ${className}`}>
      <p>{errorText(message)}</p>
      {remaining > 0 && (
        <p className="mt-2 text-sm">
          {t('Try again in {seconds} seconds.', { seconds: remaining })}
        </p>
      )}
      {needsSignIn && (
        <p className="mt-2 text-sm">
          {t(
            'Sign in in another tab, then retry here. Your current inputs stay on this page.',
          )}{' '}
          <a
            className="text-primary underline"
            href="/login"
            target="_blank"
            rel="noopener noreferrer"
          >
            {t('Sign in in another tab')}
          </a>
        </p>
      )}
      {onRetry && (
        <button
          type="button"
          className="button secondary mt-3"
          disabled={remaining > 0}
          onClick={onRetry}
        >
          {t(retryLabel)}
        </button>
      )}
    </div>
  );
}
