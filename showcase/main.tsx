import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Layers, ArrowUpRight, RotateCcw } from 'lucide-react';
import { LanguageSelect, LocaleProvider, useI18n } from '../components/ui/i18n';
import { ThemeToggle } from '../components/ui/theme';
import { parseLocale } from '../src/i18n/messages';
import { applyEvent } from '../src/realtime/board-reducer';
import { prepareMutation, ConflictError } from '../src/realtime/mutations';
import {
  commandSchema,
  type Command,
  type Snapshot,
} from '../src/realtime/protocol';
import { matchesCard, localToday } from '../src/realtime/card-filters';
import { fixture, people } from './fixture';
import { RecordedCollaboration } from './recordings';
import '../app/globals.css';

function CardModal({
  children,
  close,
  label,
}: {
  children: React.ReactNode;
  close: () => void;
  label: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      onClose={close}
      aria-label={label}
      className="motion-dialog m-auto max-h-11/12 w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-panel border border-border bg-surface p-6 text-foreground shadow-panel backdrop:bg-black/40"
    >
      {children}
    </dialog>
  );
}

function Showcase() {
  const { t, errorText } = useI18n();
  const [state, setState] = useState(fixture);
  const [search, setSearch] = useState('');
  const [assignee, setAssignee] = useState('');
  const [due, setDue] = useState('');
  const [archived, setArchived] = useState(false);
  const [draft, setDraft] = useState<{
    card: Snapshot['cards'][number];
    base: number;
  } | null>(null);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [activity, setActivity] = useState<string[]>([]);

  function commit(command: Command, baseRevision = state.board.revision) {
    const parsed = commandSchema.safeParse(command);
    if (!parsed.success) {
      setError(t('Check the title and date before saving.'));
      return false;
    }
    try {
      const mutation = {
        command: parsed.data,
        baseRevision,
        clientMutationId: crypto.randomUUID(),
      };
      const patch = prepareMutation(state, mutation, people[0].id);
      const next = applyEvent(state, {
        boardId: state.board.id,
        revision: state.board.revision + 1,
        eventId: crypto.randomUUID(),
        clientMutationId: mutation.clientMutationId,
        actorId: people[0].id,
        type: command.type,
        payload: patch,
        createdAt: new Date().toISOString(),
      });
      setState(next);
      setActivity((items) => [command.type, ...items].slice(0, 8));
      setError('');
      return true;
    } catch (caught) {
      if (caught instanceof ConflictError) setConflict(true);
      else setError(errorText(caught instanceof Error ? caught.message : ''));
      return false;
    }
  }
  function save(retry = false) {
    if (!draft) return;
    if (
      commit(
        {
          type: 'card.update',
          payload: {
            id: draft.card.id,
            title: draft.card.title,
            description: draft.card.description,
            assigneeId: draft.card.assigneeId,
            dueDate: draft.card.dueDate,
          },
        },
        retry ? state.board.revision : draft.base,
      )
    ) {
      setDraft(null);
      setConflict(false);
    }
  }
  function reset() {
    setState(fixture());
    setDraft(null);
    setConflict(false);
    setError('');
    setActivity([]);
    setSearch('');
    setAssignee('');
    setDue('');
    setArchived(false);
  }
  const visible = state.cards.filter(
    (card) =>
      card.archived === archived &&
      matchesCard(card, search, assignee, due, localToday()),
  );
  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border bg-surface px-6 py-4">
        <a className="brand" href="https://github.com/happyloa/collab-edge">
          <Layers size={23} />
          CollabEdge
        </a>
        <div className="flex items-center gap-3">
          <span className="badge">{t('Interactive demo')}</span>
          <LanguageSelect />
          <ThemeToggle />
        </div>
      </header>
      <main className="mx-auto max-w-7xl p-5 sm:p-8">
        <div className="motion-reveal mb-7 flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="eyebrow mb-3">
              {t('A little less friction. A lot more together.')}
            </p>
            <h1 className="text-3xl font-semibold">
              {t('Make room for good work.')}
            </h1>
            <p className="mt-3 max-w-2xl text-muted">
              {t(
                'A public playground. Changes stay in this tab and reset on reload. No account or server connection.',
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <a className="button secondary" href="#recorded-collaboration">
              {t('Watch real two-browser test')}
              <ArrowUpRight size={16} />
            </a>
            <a
              className="button secondary"
              href="https://github.com/happyloa/collab-edge"
            >
              {t('View source')}
              <ArrowUpRight size={16} />
            </a>
          </div>
        </div>
        <div className="notice motion-reveal motion-delay-1 mb-6">
          {t(
            'Try editing a card, moving it, or simulating a teammate edit to see how a conflicting draft is preserved. Live collaboration is available in the private app and local setup.',
          )}
        </div>
        <div className="motion-reveal motion-delay-2 mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Website Launch</h2>
            <p className="mt-1 text-sm text-muted">
              {t('Revision {revision}', { revision: state.board.revision })}
            </p>
          </div>
          <button className="button secondary" onClick={reset}>
            <RotateCcw size={16} />
            {t('Reset demo')}
          </button>
        </div>
        <div className="surface motion-reveal motion-delay-3 mb-6 flex flex-wrap items-end gap-3 p-4">
          <label className="field min-w-48 flex-1">
            {t('Search cards')}
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <label className="field">
            {t('Filter by assignee')}
            <select
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
            >
              <option value="">{t('All members')}</option>
              <option value="unassigned">{t('Unassigned')}</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            {t('Filter by due date')}
            <select value={due} onChange={(e) => setDue(e.target.value)}>
              <option value="">{t('All dates')}</option>
              {[
                ['today', 'Due today'],
                ['overdue', 'Overdue'],
                ['upcoming', 'Upcoming'],
                ['none', 'No due date'],
              ].map(([value, label]) => (
                <option key={value} value={value}>
                  {t(label)}
                </option>
              ))}
            </select>
          </label>
          <button
            className="button secondary"
            onClick={() => {
              setSearch('');
              setAssignee('');
              setDue('');
            }}
          >
            {t('Clear filters')}
          </button>
          <label className="flex items-center gap-2 text-sm">
            <input
              className="w-auto"
              type="checkbox"
              checked={archived}
              onChange={(e) => setArchived(e.target.checked)}
            />
            {t('Archived cards')}
          </label>
        </div>
        {error && (
          <p className="notice error mb-4" role="alert">
            {error}
          </p>
        )}
        {!visible.length && (
          <p className="notice mb-4">{t('No matching cards')}</p>
        )}
        <div className="grid gap-5 md:grid-cols-3">
          {state.columns.map((column, index) => (
            <section
              key={column.id}
              aria-label={t(column.title)}
              className="motion-reveal rounded-panel border border-border bg-border/25 p-4"
              style={{ animationDelay: `${index * 80}ms` }}
            >
              <h3 className="mb-4 flex items-center gap-2 font-semibold">
                <span className={`column-dot tone-${index + 1}`} />
                {t(column.title)}
                <span className="ml-auto text-sm font-normal text-muted">
                  {visible.filter((card) => card.columnId === column.id).length}
                </span>
              </h3>
              <div className="space-y-3">
                {visible
                  .filter((card) => card.columnId === column.id)
                  .sort((a, b) => a.position - b.position)
                  .map((card) => (
                    <article
                      key={card.id}
                      className="surface interactive-surface motion-card p-4"
                    >
                      <button
                        className="mb-3 text-left font-medium hover:text-primary"
                        onClick={() => {
                          setDraft({
                            card: { ...card },
                            base: state.board.revision,
                          });
                          setConflict(false);
                          setError('');
                        }}
                      >
                        {card.title}
                      </button>
                      <p className="mb-4 line-clamp-2 text-sm text-muted">
                        {card.description}
                      </p>
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                        <span className="badge">
                          {people.find(
                            (person) => person.id === card.assigneeId,
                          )?.name ?? t('Unassigned')}
                        </span>
                        <span>{card.dueDate ?? t('No due date')}</span>
                      </div>
                      {archived && (
                        <button
                          className="button secondary mt-3 w-full"
                          onClick={() =>
                            commit({
                              type: 'card.restore',
                              payload: { id: card.id },
                            })
                          }
                        >
                          {t('Restore card')}
                        </button>
                      )}
                    </article>
                  ))}
              </div>
            </section>
          ))}
        </div>
        <aside className="surface motion-reveal mt-6 p-5">
          <h2 className="font-semibold">{t('Activity')}</h2>
          {activity.length ? (
            <ol className="mt-3 flex flex-wrap gap-2">
              {activity.map((item, index) => (
                <li key={`${index}-${item}`} className="tag">
                  {t(item)}
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-2 text-sm text-muted">
              {t('Your changes will appear here.')}
            </p>
          )}
        </aside>
        <RecordedCollaboration />
        <footer className="mt-8 flex flex-wrap justify-between gap-3 text-sm text-muted">
          <p>{t('Browser-only demo · No Cloudflare API requests')}</p>
          <a
            className="underline"
            href="https://collab-edge.piafyoyo06.workers.dev"
          >
            {t('Private app (owner access)')}
          </a>
        </footer>
      </main>
      {draft && (
        <CardModal close={() => setDraft(null)} label={t('Edit card')}>
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-xl font-semibold">{t('Edit card')}</h2>
            <button className="button secondary" onClick={() => setDraft(null)}>
              {t('Close card')}
            </button>
          </div>
          {conflict && (
            <div role="alert" className="notice error mb-4">
              <p>
                {t(
                  'A teammate changed the title. Your draft is preserved below.',
                )}
              </p>
              <button
                className="button secondary mt-3"
                onClick={() => save(true)}
              >
                {t('Retry my draft')}
              </button>
            </div>
          )}
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              save();
            }}
          >
            <label className="field">
              {t('Title')}
              <input
                required
                maxLength={160}
                value={draft.card.title}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    card: { ...draft.card, title: e.target.value },
                  })
                }
              />
            </label>
            <label className="field">
              {t('Description')}
              <textarea
                maxLength={10000}
                value={draft.card.description}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    card: { ...draft.card, description: e.target.value },
                  })
                }
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="field">
                {t('Assignee')}
                <select
                  aria-label={t('Assignee')}
                  value={draft.card.assigneeId ?? ''}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      card: {
                        ...draft.card,
                        assigneeId: e.target.value || null,
                      },
                    })
                  }
                >
                  <option value="">{t('Unassigned')}</option>
                  {people.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                {t('Due date')}
                <input
                  type="date"
                  value={draft.card.dueDate ?? ''}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      card: {
                        ...draft.card,
                        dueDate: e.target.value || null,
                      },
                    })
                  }
                />
              </label>
            </div>
            <label className="field">
              {t('Move to')}
              <select
                disabled={draft.card.archived}
                value={
                  state.cards.find((card) => card.id === draft.card.id)
                    ?.columnId
                }
                onChange={(e) => {
                  commit({
                    type: 'card.move',
                    payload: {
                      id: draft.card.id,
                      columnId: e.target.value,
                      beforeId: null,
                    },
                  });
                }}
              >
                {state.columns.map((column) => (
                  <option key={column.id} value={column.id}>
                    {t(column.title)}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex flex-wrap gap-2">
              <button className="button" disabled={draft.card.archived}>
                {t('Save changes')}
              </button>
              <button
                type="button"
                className="button secondary"
                disabled={draft.card.archived}
                onClick={() =>
                  commit({
                    type: 'card.update',
                    payload: {
                      id: draft.card.id,
                      title: `Bob · ${state.board.revision + 1}`,
                    },
                  })
                }
              >
                {t('Simulate teammate edit')}
              </button>
              <button
                type="button"
                className="button secondary"
                disabled={draft.card.archived}
                onClick={() => {
                  if (
                    commit({
                      type: 'card.archive',
                      payload: { id: draft.card.id },
                    })
                  )
                    setDraft(null);
                }}
              >
                {t('Archive card')}
              </button>
            </div>
          </form>
        </CardModal>
      )}
    </>
  );
}

const locale = parseLocale(
  document.cookie
    .split('; ')
    .find((part) => part.startsWith('collabedge_locale='))
    ?.split('=')[1],
);
document.documentElement.lang = locale;
createRoot(document.getElementById('root')!).render(
  <LocaleProvider initialLocale={locale}>
    <Showcase />
  </LocaleProvider>,
);
