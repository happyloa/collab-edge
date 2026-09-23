'use client';
import { useI18n, LanguageSelect } from '../components/ui/i18n';
import { DemoEntry } from '../components/demo-entry';
import Link from 'next/link';
import {
  ArrowUpRight,
  Layers3,
  Radio,
  ShieldCheck,
  GitBranch,
} from 'lucide-react';
import { ThemeToggle } from '../components/ui/theme';
const features = [
  {
    Icon: Radio,
    title: 'Together, in real time',
    description:
      'Changes travel as ordered events. Your team stays on the same page.',
  },
  {
    Icon: ShieldCheck,
    title: 'A little more certainty',
    description:
      'Conflicting edits are surfaced clearly, with your draft kept safe.',
  },
  {
    Icon: GitBranch,
    title: 'Built for the in-between',
    description:
      'Step away, reconnect, and pick up exactly where your team is now.',
  },
];
export default function Home() {
  const { t } = useI18n();

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-7">
        <Link href="/" className="brand">
          <Layers3 size={24} /> CollabEdge
          <span className="badge">{t('BETA')}</span>
        </Link>
        <nav className="flex flex-wrap items-center gap-3 sm:gap-5">
          <LanguageSelect />
          <ThemeToggle />
          <Link href="/login">{t('Sign in')}</Link>
          <Link className="button" href="/register">
            {t('Get started')}
            <ArrowUpRight size={16} />
          </Link>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-16">
        <p className="eyebrow motion-reveal">
          <span className="status-dot" />
          {t('A little closer. A lot more in sync.')}
        </p>
        <h1 className="motion-reveal motion-delay-1 mt-6 max-w-4xl text-5xl font-semibold tracking-tight sm:text-7xl">
          {t('Good work happens')}
          <br />
          {t('in a')} <span className="text-primary">{t('shared space.')}</span>
        </h1>
        <p className="motion-reveal motion-delay-2 mt-7 max-w-xl text-lg leading-relaxed text-muted">
          {t(
            'Bring your team’s next big idea into focus. Plan together, see changes as they happen, and keep every decision in the same conversation.',
          )}
        </p>
        <div className="motion-reveal motion-delay-3 mt-9 flex flex-wrap gap-4">
          <Link href="/register" className="button">
            {t('Create your workspace')}
            <ArrowUpRight size={18} />
          </Link>
          <Link href="/login" className="button secondary">
            {t('Open workspace')}
          </Link>
        </div>
        <DemoEntry />
        <section
          aria-label={t('Product preview')}
          className="surface motion-reveal motion-delay-4 mt-16 overflow-hidden"
        >
          <div className="flex items-center justify-between border-b border-border p-5">
            <div>
              <span className="text-sm text-muted">
                {t('Acme Product Team /')}
              </span>
              <h2 className="mt-1 font-semibold">{t('Website Launch')}</h2>
            </div>
            <span className="badge">
              <span className="status-dot" />
              {t('Preview')}
            </span>
          </div>
          <div className="grid gap-4 bg-background p-6 sm:grid-cols-3">
            {[
              [
                'Backlog',
                'Map the customer journey',
                'Explore a clearer first impression',
              ],
              [
                'In Progress',
                'Build a home for the next chapter',
                'Bring the visual identity to life',
              ],
              [
                'Review',
                'Make every interaction accessible',
                'Test the details that matter',
              ],
            ].map(([name, ...titles], i) => (
              <div key={t(name)}>
                <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
                  <span className={`column-dot tone-${i}`} />
                  {t(name)}
                  <span className="ml-auto text-muted">02</span>
                </div>
                {titles.map((title, j) => (
                  <div
                    key={t(title)}
                    className="surface interactive-surface mb-3 p-5"
                  >
                    <span className="tag">{t(j ? 'Design' : 'Product')}</span>
                    <h3 className="my-4 font-medium">{t(title)}</h3>
                    <div className="flex justify-between text-xs text-muted">
                      <span>CE–{i * 2 + j + 1}</span>
                      <span className="avatar">{j ? 'BK' : 'AL'}</span>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>
        <section className="mt-14 grid gap-8 sm:grid-cols-3">
          {features.map(({ Icon, title, description }, index) => (
            <article
              key={t(title)}
              className="motion-reveal"
              style={{ animationDelay: `${index * 90}ms` }}
            >
              <Icon className="mb-4 text-primary" size={23} />
              <h2 className="font-semibold">{t(title)}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                {t(description)}
              </p>
            </article>
          ))}
        </section>
      </main>
      <footer className="mx-auto flex max-w-6xl justify-between border-t border-border px-6 py-8 text-sm text-muted">
        <span>{t('Made for moving forward, together.')}</span>
        <a href="https://github.com/happyloa/collab-edge">
          {t('View source ↗')}
        </a>
      </footer>
    </div>
  );
}
