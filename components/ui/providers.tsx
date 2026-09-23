'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { LocaleProvider } from './i18n';
import type { Locale } from '../../src/i18n/messages';
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
          queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
        },
      }),
  );
  return (
    <LocaleProvider initialLocale={locale}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </LocaleProvider>
  );
}
export async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options?.body instanceof FormData
        ? {}
        : { 'Content-Type': 'application/json' }),
      ...options?.headers,
    },
  });
  const data: unknown = await response.json();
  if (!response.ok)
    throw new Error(
      data &&
        typeof data === 'object' &&
        'error' in data &&
        typeof data.error === 'string'
        ? data.error
        : 'Request failed',
    );
  return data as T;
}
