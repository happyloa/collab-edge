import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '../components/ui/providers';

export const metadata: Metadata = {
  title: 'CollabEdge — A shared space for what comes next',
  description:
    'A realtime workspace with server-authoritative collaboration, built at the edge.',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
