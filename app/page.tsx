'use client';
import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
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
        gsap.from('[data-hero-node]', {
          opacity: 0,
          scale: 0.7,
          rotation: -8,
          duration: 0.9,
          stagger: 0.13,
          delay: 0.25,
          ease: 'back.out(1.4)',
          clearProps: 'opacity,scale,rotation',
        });
        gsap.to('[data-ticker-track]', {
          xPercent: -50,
          duration: 30,
          ease: 'none',
          repeat: -1,
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
      <main className="mx-auto max-w-6xl px-6 pt-8 pb-20 sm:pt-12">
        <section className="home-hero">
          <div className="home-hero-art" aria-hidden="true">
            <div className="home-hero-ring home-hero-ring-outer" />
            <div className="home-hero-ring home-hero-ring-inner" />
            <div className="home-hero-node home-hero-node-a" data-hero-node>
              A
            </div>
            <div className="home-hero-node home-hero-node-b" data-hero-node>
              B
            </div>
            <div
              className="home-hero-node home-hero-node-center"
              data-hero-node
            >
              <Layers3 size={32} strokeWidth={1.6} />
            </div>
            <div className="home-hero-cross home-hero-cross-a" />
            <div className="home-hero-cross home-hero-cross-b" />
          </div>
          <div className="relative z-10">
            <p className="eyebrow" data-hero-enter>
              <span className="status-dot" />
              {t('A little closer. A lot more in sync.')}
            </p>
            <h1 className="mt-6 max-w-4xl text-5xl font-semibold tracking-tight sm:text-7xl">
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
                'Bring your team’s next big idea into focus. Plan together, see changes as they happen, and keep every decision in the same conversation.',
              )}
            </p>
            <div className="mt-9 flex flex-wrap gap-4" data-hero-enter>
              <Link href="/register" className="button">
                {t('Create your workspace')}
                <ArrowUpRight size={18} />
              </Link>
              <Link href="/login" className="button secondary">
                {t('Open workspace')}
              </Link>
            </div>
            <div data-hero-enter>
              <DemoEntry />
            </div>
          </div>
        </section>
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
          aria-label={t('Product preview')}
          className="surface mt-16 overflow-hidden"
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
            <article key={t(title)} className="home-feature" data-feature>
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
