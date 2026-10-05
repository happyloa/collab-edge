'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { LocaleProvider } from './i18n';
import type { Locale } from '../../src/i18n/messages';
import { shouldRetryApiError } from '../../src/lib/api-client';
export { api } from '../../src/lib/api-client';
export function Providers({
  children,
  locale = 'en',
}: {
  children: React.ReactNode;
  locale?: Locale;
}) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: shouldRetryApiError,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );
  return (
    <LocaleProvider initialLocale={locale}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </LocaleProvider>
  );
}
