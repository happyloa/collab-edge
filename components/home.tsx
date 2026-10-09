'use client';
import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useI18n, LanguageSelect } from './ui/i18n';
import { DemoEntry } from './demo-entry';
import { CollaborationStory } from './collaboration-story';
import Link from 'next/link';
import {
  ArrowUpRight,
  Layers3,
  Radio,
  ShieldCheck,
  GitBranch,
  ArrowDown,
  Check,
} from 'lucide-react';
import { ThemeToggle } from './ui/theme';
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
          y: 32,
          duration: 0.8,
          stagger: 0.11,
          ease: 'power3.out',
          clearProps: 'all',
        });
        gsap.from('[data-hero-visual]', {
          opacity: 0,
          scale: 0.96,
          rotation: 2,
          duration: 0.9,
          delay: 0.25,
          ease: 'power3.out',
          clearProps: 'opacity,scale,rotation',
        });
        gsap.to('[data-ticker-track]', {
          xPercent: -50,
          duration: 30,
          ease: 'none',
          repeat: -1,
          scrollTrigger: {
            trigger: '[data-ticker-track]',
            start: 'top bottom',
            end: 'bottom top',
            toggleActions: 'play pause resume pause',
          },
        });
        gsap.fromTo(
          '[data-preview]',
          { opacity: 0, y: 48, scale: 0.97 },
          {
            opacity: 1,
            y: 0,
            scale: 1,
            duration: 0.9,
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
          y: 24,
          opacity: 0,
          duration: 0.6,
          stagger: 0.14,
          clearProps: 'all',
          scrollTrigger: {
            trigger: '[data-flow]',
            start: 'top 85%',
            once: true,
          },
        });
        gsap.fromTo(
          '[data-feature]',
          { opacity: 0, y: 28 },
          {
            opacity: 1,
            y: 0,
            stagger: 0.13,
            duration: 0.7,
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
          <Layers3 size={24} /> CollabEdge
          <span className="badge">{t('BETA')}</span>
        </Link>
        <nav className="flex flex-wrap items-center gap-3 sm:gap-5">
          <a
            href="#how-it-works"
            className="hidden text-sm text-muted lg:inline"
          >
            {t('How it works')}
          </a>
          <LanguageSelect />
          <ThemeToggle />
          {signedIn ? (
            <Link className="button" href="/workspaces">
              {t('Open workspace')}
              <ArrowUpRight size={16} />
            </Link>
          ) : (
            <>
              <Link href="/login">{t('Sign in')}</Link>
              <Link className="button" href="/register">
                {t('Get started')}
                <ArrowUpRight size={16} />
              </Link>
            </>
          )}
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-5 pb-20 sm:px-8">
        <section className="relative grid items-center gap-12 py-12 lg:grid-cols-[1.15fr_1fr] lg:gap-14 lg:py-20">
          <div
            className="pointer-events-none absolute top-6 -right-20 -z-10 size-96 rounded-full bg-primary/10 blur-3xl"
            aria-hidden="true"
          />
          <div className="min-w-0">
            <p className="eyebrow" data-hero-enter>
              <span className="status-dot" />
              {t('REALTIME COLLABORATION / BUILT AT THE EDGE')}
            </p>
            <h1
              className={`mt-7 font-semibold tracking-tight text-balance ${locale === 'zh-TW' ? 'text-5xl leading-[1.2] sm:text-6xl' : 'text-5xl leading-[1.08] sm:text-6xl xl:text-7xl'}`}
            >
              <span className="block" data-hero-enter>
                {t('Good work happens')}
              </span>
              <span className="block" data-hero-enter>
                {t('in a')}{' '}
                <span className="text-primary">{t('shared space.')}</span>
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
              {signedIn ? (
                <Link href="/workspaces" className="button">
                  {t('Open workspace')}
                  <ArrowUpRight size={18} />
                </Link>
              ) : (
                <>
                  <Link href="/register" className="button">
                    {t('Create your workspace')}
                    <ArrowUpRight size={18} />
                  </Link>
                  <Link href="/login" className="button secondary">
                    {t('Open workspace')}
                  </Link>
                </>
              )}
            </div>
            <a
              href="https://happyloa.github.io/collab-edge/"
              className="mt-5 inline-flex items-center gap-2 border-b border-primary/40 pb-1 text-sm text-primary"
              data-hero-enter
            >
              {t('Explore the public playground')}
              <ArrowUpRight size={16} />
            </a>
            {!signedIn && (
              <div data-hero-enter>
                <DemoEntry />
              </div>
            )}
          </div>
          <div className="relative min-w-0" data-hero-visual>
            <div className="mb-3 flex items-center justify-between text-xs text-muted">
              <span>{t('THE COLLABORATION STUDY')}</span>
              <span aria-hidden="true">01 — 03</span>
            </div>
            <CollaborationStory />
          </div>
        </section>
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border py-5 text-xs text-muted">
          <span>VINEXT / REACT / DURABLE OBJECTS / D1</span>
          <a href="#how-it-works" className="inline-flex items-center gap-2">
            {t('Follow a change through the system')}
            <ArrowDown size={14} />
          </a>
        </div>
        <div className="home-ticker mt-8" aria-hidden="true">
          <div className="home-ticker-track" data-ticker-track>
            {[0, 1].map((copy) => (
              <span className="home-ticker-group" key={copy}>
                <span>{t('Together, in real time')}</span>
                <span className="home-ticker-star">✳</span>
                <span>{t('A little more certainty')}</span>
                <span className="home-ticker-star">✳</span>
                <span>{t('Built for the in-between')}</span>
                <span className="home-ticker-star">✳</span>
              </span>
            ))}
          </div>
        </div>
        <section
          id="how-it-works"
          className="scroll-mt-8 py-14 sm:py-20"
          data-flow
        >
          <div className="mb-9 flex flex-wrap items-end justify-between gap-5">
            <div className="max-w-2xl">
              <p className="eyebrow mb-4">{t('01 / UNDER THE SURFACE')}</p>
              <h2 className="text-3xl leading-tight font-semibold tracking-tight sm:text-4xl">
                {t('Every change has a place in the story.')}
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
          <div className="grid gap-4 md:grid-cols-3">
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
                className="rounded-2xl border border-border bg-surface p-6"
                data-flow-step
              >
                <div className="mb-8 flex items-center justify-between text-primary">
                  <span
                    className="text-4xl font-light tracking-tight"
                    aria-hidden="true"
                  >
                    {number}
                  </span>
                  <Check size={18} />
                </div>
                <h3 className="text-lg font-semibold">{t(title)}</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted">
                  {t(description)}
                </p>
              </article>
            ))}
          </div>
        </section>
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow mb-4">{t('02 / THE SHARED SPACE')}</p>
            <h2 className="text-3xl font-semibold tracking-tight">
              {t('A familiar board. Thoughtful details.')}
            </h2>
          </div>
          <span className="text-sm text-muted">
            {t('A preview of the private app')}
          </span>
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
        <section className="mt-14 grid gap-8 sm:grid-cols-3" data-features>
          {features.map(({ Icon, title, description }) => (
            <article
              key={t(title)}
              className="border-t-2 border-primary px-1 pt-6"
              data-feature
            >
              <Icon className="mb-4 text-primary" size={23} />
              <h2 className="font-semibold">{t(title)}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                {t(description)}
              </p>
            </article>
          ))}
        </section>
        <section className="mt-16 flex flex-wrap items-center justify-between gap-6 rounded-3xl border border-border bg-primary/8 px-7 py-10 sm:px-10">
          <div>
            <p className="eyebrow mb-3">{t('03 / TRY IT FOR YOURSELF')}</p>
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {t('Make a change. See what happens.')}
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">
              {t(
                'The public playground runs in your browser. Explore cards and conflicts without an account.',
              )}
            </p>
          </div>
          <a className="button" href="https://happyloa.github.io/collab-edge/">
            {t('Explore the public playground')}
            <ArrowUpRight size={18} />
          </a>
        </section>
      </main>
      <footer className="mx-auto flex max-w-7xl flex-wrap justify-between gap-4 border-t border-border px-5 py-8 text-sm text-muted sm:px-8">
        <span>{t('Made for moving forward, together.')}</span>
        <a href="https://github.com/happyloa/collab-edge">
          {t('View source ↗')}
        </a>
      </footer>
    </div>
  );
}
