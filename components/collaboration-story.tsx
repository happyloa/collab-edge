'use client';

import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { ArrowRight, Check, GitBranch, Radio, RotateCcw } from 'lucide-react';
import { useI18n } from './ui/i18n';
import { useHydrated } from './ui/use-hydrated';

const scenarios = [
  { id: 'sync', label: 'Stay in sync', Icon: Radio },
  { id: 'conflict', label: 'Keep your draft', Icon: GitBranch },
  { id: 'reconnect', label: 'Catch up again', Icon: RotateCcw },
] as const;
type Scenario = (typeof scenarios)[number]['id'];

export function CollaborationStory() {
  const { locale, t } = useI18n();
  const ready = useHydrated();
  const [scenario, setScenario] = useState<Scenario>('sync');
  const root = useRef<HTMLElement>(null);
  const conflict = scenario === 'conflict';
  const revision = scenario === 'sync' ? 41 : 42;
  const explanation = {
    sync: 'One committed change. The same revision in both browsers.',
    conflict:
      'Bob changed the title first. Alice keeps her draft and chooses what to send next.',
    reconnect:
      'Missed changes replay in order. A snapshot fills in when history cannot be replayed.',
  }[scenario];

  useEffect(() => {
    const motion = gsap.matchMedia();
    motion.add(
      '(prefers-reduced-motion: no-preference)',
      () => {
        gsap.from('[data-story-card]', {
          y: 12,
          opacity: 0.6,
          duration: 0.45,
          stagger: 0.08,
          ease: 'power2.out',
          clearProps: 'all',
        });
      },
      root,
    );
    return () => motion.revert();
  }, [scenario, locale]);

  return (
    <section
      ref={root}
      aria-label={t('How collaboration works')}
      className="story-artifact relative min-w-0 overflow-hidden rounded-3xl border border-border bg-surface p-5 shadow-float sm:p-7"
    >
      <div className="mb-7 flex items-center justify-between gap-3">
        <span className="eyebrow">{t('TWO VIEWS. ONE BOARD.')}</span>
        <span className="text-xs text-muted">{t('Illustrative flow')}</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {['Alice', 'Bob'].map((person, index) => {
          const draft = conflict && index === 0;
          return (
            <article
              key={person}
              className={`min-w-0 rounded-2xl border p-4 ${draft ? 'border-warning bg-warning/5' : 'border-border bg-background'}`}
              data-story-card
            >
              <div className="mb-6 flex items-center gap-2 text-sm">
                <span className="avatar bg-primary/10 text-primary">
                  {person[0]}
                </span>
                <span>{person}</span>
              </div>
              <span className="text-[0.65rem] tracking-widest text-muted">
                CE–01
              </span>
              <h3 className="mt-2 min-h-14 text-sm leading-relaxed font-semibold">
                {t(draft ? 'My team’s next chapter' : 'Build a shared space')}
              </h3>
              <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-xs">
                <span className={draft ? 'text-warning' : 'text-success'}>
                  {t(draft ? 'Draft preserved' : 'Committed')}
                </span>
                <span className="text-muted">r{draft ? 40 : revision}</span>
              </div>
            </article>
          );
        })}
      </div>
      <div className="relative my-6 grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-xs text-muted">
        <span
          className="absolute inset-x-2 top-1/2 h-px bg-control-border"
          aria-hidden="true"
        />
        <span className="relative w-fit bg-surface pr-2">Alice</span>
        <span className="relative flex items-center gap-2 rounded-full border border-control-border bg-surface px-4 py-2 text-foreground">
          {conflict ? <GitBranch size={14} /> : <Check size={14} />}
          {t(
            conflict ? 'Field conflict detected' : 'Server revision {revision}',
            { revision },
          )}
        </span>
        <span className="relative ml-auto w-fit bg-surface pl-2">Bob</span>
      </div>
      <p
        className="min-h-20 text-sm leading-relaxed text-muted"
        aria-live="polite"
        aria-atomic="true"
      >
        {t(explanation)}
      </p>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {scenarios.map(({ id, label, Icon }, index) => (
          <button
            key={id}
            type="button"
            disabled={!ready}
            aria-pressed={scenario === id}
            onClick={() => setScenario(id)}
            className={`flex min-w-0 flex-col items-start gap-3 rounded-xl border p-3 text-left text-xs leading-relaxed transition-colors ${scenario === id ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted hover:bg-background'}`}
          >
            <span
              className="flex w-full items-center justify-between"
              aria-hidden="true"
            >
              <Icon size={16} />
              <span>0{index + 1}</span>
            </span>
            {t(label)}
          </button>
        ))}
      </div>
      <p className="mt-5 flex items-start gap-2 text-xs leading-relaxed text-muted">
        <ArrowRight size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
        {t(
          'Illustrated scenarios only. No server connection or saved changes.',
        )}
      </p>
    </section>
  );
}
