'use client';
import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useI18n, LanguageSelect } from './ui/i18n';
import { DemoEntry } from './demo-entry';
import { CollaborationStory } from './collaboration-story';
import Link from 'next/link';
import { ArrowUpRight, ArrowRight, ArrowDown } from 'lucide-react';
import { ThemeToggle } from './ui/theme';
import { BrandMark } from './ui/brand-mark';
// The four questions a shared board has to answer, and what this one does.
const features = [
  {
    title: 'Who orders concurrent edits?',
    description: 'One Durable Object serializes each board; D1 is canonical.',
  },
  {
    title: 'A write committed but the peer missed it',
    description:
      'Entity, revision and event commit in one batch before broadcast; reconnect replays or resnapshots.',
  },
  {
    title: 'Does a retry create duplicates?',
    description:
      'Every operation carries a UUID, deduplicated by a unique constraint.',
  },
  {
    title: 'Someone changed the same field',
    description:
      'Per-field revisions detect it; your attempted edit is kept for retry or discard.',
  },
];
export function Home({ signedIn }: { signedIn: boolean }) {
  const { locale, t } = useI18n();
  const homeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!homeRef.current) return;
    gsap.registerPlugin(ScrollTrigger);
    const motion = gsap.matchMedia();

    motion.add(
      '(prefers-reduced-motion: no-preference)',
      () => {
        gsap.from('[data-hero-enter]', {
          opacity: 0,
          y: 10,
          duration: 0.45,
          stagger: 0.05,
          ease: 'power3.out',
          clearProps: 'all',
        });
        gsap.from('[data-hero-visual]', {
          opacity: 0,
          duration: 0.45,
          delay: 0.15,
          ease: 'power3.out',
          clearProps: 'opacity',
        });
        gsap.fromTo(
          '[data-preview]',
          { opacity: 0, y: 12 },
          {
            opacity: 1,
            y: 0,
            duration: 0.45,
            ease: 'power3.out',
            immediateRender: false,
            clearProps: 'all',
            scrollTrigger: {
              trigger: '[data-preview]',
              start: 'top 88%',
              once: true,
            },
          },
        );
        gsap.from('[data-flow-step]', {
          y: 12,
          opacity: 0,
          duration: 0.4,
          stagger: 0.06,
          clearProps: 'all',
          scrollTrigger: {
            trigger: '[data-flow]',
            start: 'top 85%',
            once: true,
          },
        });
        gsap.fromTo(
          '[data-feature]',
          { opacity: 0, y: 12 },
          {
            opacity: 1,
            y: 0,
            stagger: 0.06,
            duration: 0.4,
            ease: 'power2.out',
            immediateRender: false,
            clearProps: 'all',
            scrollTrigger: {
              trigger: '[data-features]',
              start: 'top 88%',
              once: true,
            },
          },
        );
      },
      homeRef,
    );

    return () => motion.revert();
  }, [locale]);

  return (
    <div ref={homeRef} className="min-h-screen overflow-x-clip">
      <header className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 border-b border-border px-5 py-6 sm:px-8">
        <Link href="/" className="brand">
          <BrandMark />
          <span className="badge">{t('BETA')}</span>
        </Link>
        <nav
          className="flex flex-wrap items-center gap-3 sm:gap-5"
          aria-label={t('Main navigation')}
        >
          <LanguageSelect />
          <ThemeToggle />
          {signedIn ? (
            <Link
              className="text-sm font-medium text-primary"
              href="/workspaces"
            >
              {t('Open workspace')}
              <ArrowUpRight size={16} />
            </Link>
          ) : (
            <Link className="text-sm font-medium text-primary" href="/login">
              {t('Sign in')}
            </Link>
          )}
          <a
            className="button hidden sm:inline-flex"
            href="https://happyloa.github.io/collab-edge/"
          >
            {t('Explore the public playground')}
            <ArrowUpRight size={16} aria-hidden="true" />
          </a>
        </nav>
      </header>
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto max-w-7xl px-5 pb-20 sm:px-8"
      >
        <section className="relative grid items-center gap-12 py-12 lg:grid-cols-[1.15fr_1fr] lg:gap-14 lg:py-20">
          <div className="min-w-0">
            <h1
              className={`font-semibold tracking-tight text-balance ${locale === 'zh-TW' ? 'text-[clamp(2rem,9vw,3.75rem)] leading-[1.2] sm:text-6xl' : 'text-5xl leading-[1.05] sm:text-6xl xl:text-[5.25rem]'}`}
            >
              <span className="block" data-hero-enter>
                {t('Work moves forward.')}
              </span>
              <span className="block" data-hero-enter>
                <span className="home-headline-accent">
                  {t('Changes stay in view.')}
                </span>
              </span>
            </h1>
            <p
              className="mt-7 max-w-xl text-lg leading-relaxed text-muted"
              data-hero-enter
            >
              {t(
                'Plan on one board. See every committed change, keep your draft when edits collide, and reconnect without losing your place.',
              )}
            </p>
            <div className="mt-9 flex flex-wrap gap-3" data-hero-enter>
              <a
                href="https://happyloa.github.io/collab-edge/"
                className="button"
              >
                {t('Explore the public playground')}
                <ArrowUpRight size={18} aria-hidden="true" />
              </a>
              <a href="#how-it-works" className="button secondary">
                {t('See how synchronization works')}
                <ArrowDown size={16} aria-hidden="true" />
              </a>
            </div>
            <a
              href="https://github.com/happyloa/collab-edge/blob/main/docs/architecture.md"
              className="mt-5 inline-flex items-center gap-2 border-b border-primary/40 pb-1 text-sm text-primary"
              data-hero-enter
            >
              {t('Source and architecture')}
              <ArrowUpRight size={16} />
            </a>
            {!signedIn && (
              <div data-hero-enter>
                <p className="mt-8 max-w-lg text-xs leading-relaxed text-muted">
                  {t(
                    'The private app requires authorized Cloudflare Access. The public playground needs no sign-in.',
                  )}
                </p>
                <Link
                  href="/register"
                  className="mt-3 inline-block text-sm text-primary underline underline-offset-4"
                >
                  {t('Create an account')}
                </Link>
                <DemoEntry />
              </div>
            )}
          </div>
          <div className="relative min-w-0" data-hero-visual>
            <CollaborationStory />
          </div>
        </section>
        <section
          id="how-it-works"
          className="scroll-mt-8 border-t border-foreground py-14 sm:py-20"
          data-flow
        >
          <div className="mb-9 flex flex-wrap items-end justify-between gap-5">
            <div className="max-w-2xl">
              <h2 className="text-3xl leading-tight font-semibold tracking-tight sm:text-4xl">
                {t('Follow a change through the system')}
              </h2>
            </div>
            <a
              href="https://github.com/happyloa/collab-edge/blob/main/docs/architecture.md"
              className="inline-flex items-center gap-2 text-sm text-primary"
            >
              {t('Read the architecture')}
              <ArrowUpRight size={16} />
            </a>
          </div>
          <div className="home-flow grid gap-0 md:grid-cols-3">
            {[
              [
                '01',
                'Keep the attempted edit',
                'The browser keeps confirmed state and your pending draft separately.',
              ],
              [
                '02',
                'Commit before broadcasting',
                'One coordinator per board checks permissions and commits data, revision and event together.',
              ],
              [
                '03',
                'Bring everyone up to date',
                'Authorized browsers receive ordered events. Reconnects replay changes or load a consistent snapshot.',
              ],
            ].map(([number, title, description]) => (
              <article
                key={number}
                className="home-flow-step border-t border-border px-1 py-6 md:px-6 md:py-8"
                data-flow-step
              >
                <span
                  className="mb-6 block font-mono text-xs text-muted"
                  aria-hidden="true"
                >
                  {number}
                </span>
                <h3 className="text-lg font-semibold">{t(title)}</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted">
                  {t(description)}
                </p>
              </article>
            ))}
          </div>
          <ol
            aria-label={t('Path of a change')}
            className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm font-medium text-primary"
          >
            {[
              'Command',
              'Validate and commit',
              'Ordered event',
              'Authorized peers',
            ].map((step, index) => (
              <li key={step} className="inline-flex items-center gap-3">
                {index > 0 && <ArrowRight size={14} aria-hidden="true" />}
                <span>{t(step)}</span>
              </li>
            ))}
          </ol>
        </section>
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-3xl font-semibold tracking-tight">
            {t('A preview of the private app')}
          </h2>
        </div>
        <section
          aria-label={t('Product preview')}
          className="surface overflow-hidden"
          data-preview
        >
          <div className="flex items-center justify-between border-b border-border p-5">
            <div>
              <span className="text-sm text-muted">
                {t('Acme Product Team /')}
              </span>
              <h2 className="mt-1 font-semibold">{t('Website Launch')}</h2>
            </div>
            <span className="badge">{t('Preview')}</span>
          </div>
          <div className="grid gap-4 bg-background p-6 sm:grid-cols-3">
            {[
              [
                'Backlog',
                'Map the customer journey',
                'Draft the launch announcement',
              ],
              [
                'In Progress',
                'Build the new home page',
                'Refine the mobile navigation',
              ],
              [
                'Review',
                'Review keyboard accessibility',
                'Approve the visual direction',
              ],
            ].map(([name, ...titles]) => (
              <div key={t(name)}>
                <div className="mb-3 flex items-center gap-2 border-t-2 border-foreground pt-3 text-sm font-semibold">
                  {t(name)}
                  <span className="ml-auto font-mono text-xs font-normal text-muted">
                    2
                  </span>
                </div>
                {titles.map((title) => (
                  <div
                    key={t(title)}
                    className="surface interactive-surface mb-2 p-4"
                  >
                    <h3 className="text-sm font-medium">{t(title)}</h3>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>
        <section
          className="mt-16 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4"
          data-features
        >
          {features.map(({ title, description }) => (
            <article
              key={title}
              className="border-t border-foreground pt-5"
              data-feature
            >
              <h2 className="font-semibold">{t(title)}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                {t(description)}
              </p>
            </article>
          ))}
        </section>
        <section className="home-evidence mt-20 rounded-lg p-7 sm:p-12">
          <div className="grid gap-8 md:grid-cols-2">
            <div>
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                {t('Source and architecture')}
              </h2>
              <p className="mt-4 max-w-lg text-sm leading-relaxed">
                {t(
                  'Explore the source and a recorded local two-browser test. The public playground is a simulation, not a live session.',
                )}
              </p>
            </div>
            <div className="grid content-center gap-4 text-sm font-medium">
              <a
                href="https://github.com/happyloa/collab-edge"
                className="home-evidence-link"
              >
                {t('View source ↗')}
              </a>
              <a
                href="https://github.com/happyloa/collab-edge/blob/main/docs/realtime-walkthrough.md"
                className="home-evidence-link"
              >
                {t('Recorded local two-browser test')}{' '}
                <ArrowUpRight size={16} aria-hidden="true" />
              </a>
              <a
                href="https://happyloa.github.io/collab-edge/"
                className="home-evidence-link"
              >
                {t('Explore the public playground')}{' '}
                <ArrowUpRight size={16} aria-hidden="true" />
              </a>
            </div>
          </div>
        </section>
        <section className="mt-16 flex flex-wrap items-center justify-between gap-6 border-t border-foreground pt-10">
          <h2 className="max-w-xl text-2xl leading-snug font-semibold tracking-tight sm:text-3xl">
            {t(
              'The public playground runs in your browser. Explore cards and conflicts without an account.',
            )}
          </h2>
          <div className="flex flex-wrap gap-3">
            <a
              className="button"
              href="https://happyloa.github.io/collab-edge/"
            >
              {t('Explore the public playground')}
              <ArrowUpRight size={18} aria-hidden="true" />
            </a>
            <a
              className="button secondary"
              href="https://github.com/happyloa/collab-edge/blob/main/docs/architecture.md"
            >
              {t('Read the architecture')}
              <ArrowUpRight size={18} aria-hidden="true" />
            </a>
          </div>
        </section>
      </main>
      <footer className="mx-auto flex max-w-7xl flex-wrap justify-between gap-4 border-t border-border px-5 py-8 text-sm text-muted sm:px-8">
        <span>CollabEdge</span>
        <a href="https://github.com/happyloa/collab-edge">
          {t('View source ↗')}
        </a>
      </footer>
    </div>
  );
}
