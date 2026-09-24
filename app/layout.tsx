import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { localeCookie, parseLocale } from '../src/i18n/messages';
import './globals.css';
import { Providers } from '../components/ui/providers';

export const metadata: Metadata = {
  title: 'CollabEdge — A shared space for what comes next',
  description:
    'A realtime workspace with server-authoritative collaboration, built at the edge.',
  icons: {
    icon: [{ url: '/favicon.svg', type: 'image/svg+xml', sizes: 'any' }],
  },
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = parseLocale((await cookies()).get(localeCookie)?.value);
  return (
    <html lang={locale}>
      <body>
        <Providers locale={locale}>{children}</Providers>
      </body>
    </html>
  );
}
