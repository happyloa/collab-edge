import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { localeCookie, parseLocale } from '../src/i18n/messages';
import './globals.css';
import { Providers } from '../components/ui/providers';
import { SkipLink } from '../components/ui/skip-link';

export const metadata: Metadata = {
  title: 'CollabEdge — realtime kanban on Cloudflare Workers',
  description:
    'A realtime kanban board that keeps your draft when edits collide. Runs on Cloudflare Workers.',
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
        <Providers locale={locale}>
          <SkipLink />
          {children}
        </Providers>
      </body>
    </html>
  );
}
