'use client';

import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { BrandMark } from './brand-mark';
import { LanguageSelect, useI18n } from './i18n';
import { ThemeToggle } from './theme';

export function AuthShell({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  return (
    <main className="min-h-screen px-5 pb-12 sm:px-8">
      <header className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 border-b border-border py-5">
        <Link href="/" className="brand">
          <BrandMark />
        </Link>
        <div className="flex items-center gap-3">
          <LanguageSelect />
          <ThemeToggle />
        </div>
      </header>
      <div className="mx-auto grid max-w-7xl gap-10 py-8 lg:min-h-[calc(100vh-5rem)] lg:grid-cols-2 lg:items-center lg:gap-20 lg:py-16">
        <aside className="auth-story hidden rounded-2xl p-10 lg:block xl:p-14">
          <p className="auth-story-kicker">{t('PRIVATE WORKSPACE')}</p>
          <p className="mt-8 max-w-md text-5xl leading-tight font-semibold tracking-tight">
            {t('A shared place for work in progress.')}
          </p>
          <p className="mt-6 max-w-sm text-sm leading-relaxed">
            {t(
              'Keep the board, its changes, and the people working on it in context.',
            )}
          </p>
          <div className="auth-story-line mt-16" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <p className="mt-5 text-xs">
            {t('One board · ordered changes · shared context')}
          </p>
        </aside>
        <div className="motion-reveal mx-auto w-full max-w-md">
          {children}
          <p className="mt-8 border-t border-border pt-5 text-xs leading-relaxed text-muted">
            {t(
              'The private app requires authorized Cloudflare Access. The public playground needs no sign-in.',
            )}{' '}
            <a
              href="https://happyloa.github.io/collab-edge/"
              className="inline-flex items-center gap-1 text-primary underline underline-offset-4"
            >
              {t('Explore the public playground')}{' '}
              <ArrowUpRight size={13} aria-hidden="true" />
            </a>
          </p>
        </div>
      </div>
    </main>
  );
}
