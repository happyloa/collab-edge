'use client';
import { useI18n, LanguageSelect } from '../ui/i18n';
import Link from 'next/link';
import { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
  type KeyboardCoordinateGetter,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Layers3,
  Plus,
  GripVertical,
  MessageSquare,
  ArrowLeft,
  Activity,
  Download,
} from 'lucide-react';
import { api } from '../ui/providers';
import { ApiErrorNotice } from '../ui/api-error-notice';
import { ApiError, asError } from '../../src/lib/api-client';
import { createBoardBackup } from '../../src/backups/format';
import { ThemeToggle } from '../ui/theme';
import { CardDialog } from './card-dialog';
import { ActivityPanel } from './activity-panel';
import { useBoardDrafts } from './use-board-drafts';
import type { CardDraft } from '../../src/drafts/store';
import { useBoard } from '../../src/realtime/socket-client';
import { matchesCard, localToday } from '../../src/realtime/card-filters';
import type { Snapshot, Command } from '../../src/realtime/protocol';
type BoardData = {
  snapshot: Snapshot;
  role: string;
  user: { id: string; name: string };
  people: { id: string; name: string }[];
};
type Card = Snapshot['cards'][number];
export function BoardLoader({ id }: { id: string }) {
  const { t } = useI18n();

  const query = useQuery({
    queryKey: ['board', id],
    queryFn: ({ signal }) => api<BoardData>(`/api/boards/${id}`, { signal }),
  });
  if (query.error && !query.data)
    return (
      <main className="p-10">
        <ApiErrorNotice
          error={query.error}
          onRetry={() => void query.refetch()}
        />
        <Link href="/workspaces">{t('Back to workspaces')}</Link>
      </main>
    );
  if (!query.data)
    return (
      <main className="p-10">
        <div role="status" className="surface h-60 animate-pulse p-6">
          {t('Opening your shared space…')}
        </div>
      </main>
    );
  return (
    <>
      <ApiErrorNotice
        error={query.error}
        className="m-6"
        onRetry={() => void query.refetch()}
      />
      <Board key={`${id}:${query.data.user.id}`} initial={query.data} />
    </>
  );
}
function SortableCard({
  card,
  readOnly,
  open,
  pending,
  people,
}: {
  card: Card;
  readOnly: boolean;
  open: () => void;
  pending: boolean;
  people: BoardData['people'];
}) {
  const { t } = useI18n();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: card.id, disabled: readOnly });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
      className="surface sortable-surface mb-3 p-4"
    >
      <div className="flex items-start gap-2">
        <button
          className="flex-1 text-left text-sm leading-relaxed font-medium"
          onClick={open}
        >
          {card.title}
        </button>
        {!readOnly && (
          <button
            className="text-muted"
            aria-label={t('Move {title}', { title: card.title })}
            {...attributes}
            {...listeners}
          >
            <GripVertical size={16} />
          </button>
        )}
      </div>
      {card.description && (
        <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted">
          {card.description}
        </p>
      )}
      <div className="mt-5 flex items-center justify-between text-xs text-muted">
        <span>CE–{card.id.slice(0, 4).toUpperCase()}</span>
        <span>{pending ? t('Saving…') : <MessageSquare size={13} />}</span>
      </div>
      {(card.assigneeId || card.dueDate) && (
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted">
          {card.assigneeId && (
            <span>
              {people.find((p) => p.id === card.assigneeId)?.name ??
                t('Former member')}
            </span>
          )}
          {card.dueDate && <time dateTime={card.dueDate}>{card.dueDate}</time>}
        </div>
      )}
    </div>
  );
}
function Column({
  column,
  children,
  index,
}: {
  column: Snapshot['columns'][number];
  children: React.ReactNode;
  index: number;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  return (
    <section
      ref={setNodeRef}
      aria-label={column.title}
      className={`motion-reveal w-72 shrink-0 rounded-xl p-2 ${isOver ? 'bg-border' : ''}`}
      style={{ animationDelay: `${Math.min(index, 5) * 70}ms` }}
    >
      {children}
    </section>
  );
}
function Board({ initial }: { initial: BoardData }) {
  const { t, errorText, locale } = useI18n();
  const [selected, setSelected] = useState<Card | null>(null);
  const [restoredDraft, setRestoredDraft] = useState<CardDraft | null>(null);
  const drafts = useBoardDrafts(initial.user.id, initial.snapshot.board.id);
  const [showActivity, setShowActivity] = useState(false);
  const live = useBoard(
    initial.snapshot,
    initial.user.id,
    selected?.id,
    drafts.lease,
  );
  const { state } = live;
  const [search, setSearch] = useState('');
  const [assignee, setAssignee] = useState('');
  const [due, setDue] = useState('');
  const [showArchive, setShowArchive] = useState(false);
  const filtered = Boolean(search.trim() || assignee || due);
  const today = localToday();
  const [settings, setSettings] = useState<Snapshot['board'] | null>(null);
  const readOnly =
    (live.role ?? initial.role) === 'VIEWER' || state.board.archived;
  const columns = useMemo(
    () => [...state.columns].sort((a, b) => a.position - b.position),
    [state.columns],
  );
  const keyboardCoordinates = useCallback<KeyboardCoordinateGetter>(
    (event, args) => {
      // Target neighboring columns explicitly; the sortable getter can keep the
      // previous empty-column target when a keyboard drag reverses direction.
      if (event.code !== 'ArrowLeft' && event.code !== 'ArrowRight')
        return sortableKeyboardCoordinates(event, args);

      const {
        active,
        over,
        collisionRect,
        droppableRects,
        droppableContainers,
      } = args.context;
      if (!active || !collisionRect) return;
      event.preventDefault();

      const currentTarget = String(over?.id ?? active.id);
      const currentColumnId =
        state.cards.find((card) => card.id === currentTarget)?.columnId ??
        columns.find((column) => column.id === currentTarget)?.id ??
        state.cards.find((card) => card.id === active.id)?.columnId;
      const currentIndex = columns.findIndex(
        (column) => column.id === currentColumnId,
      );
      if (currentIndex < 0) return;
      const nextColumn =
        columns[currentIndex + (event.code === 'ArrowRight' ? 1 : -1)];
      const nextRect =
        nextColumn &&
        (droppableRects.get(nextColumn.id) ??
          droppableContainers
            .get(nextColumn.id)
            ?.node.current?.getBoundingClientRect());
      if (!nextRect) return;

      return {
        x: nextRect.left + (nextRect.width - collisionRect.width) / 2,
        y: nextRect.top + (nextRect.height - collisionRect.height) / 2,
      };
    },
    [columns, state.cards],
  );
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: keyboardCoordinates,
    }),
  );
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<Error | null>(null);
  async function exportBoard() {
    if (exporting || live.status !== 'Connected' || live.pending.length > 0)
      return;
    setExporting(true);
    setExportError(null);
    const snapshot = structuredClone(state);
    const people = structuredClone(initial.people);
    try {
      const backup = await createBoardBackup(snapshot, people);
      const file = new Blob([JSON.stringify(backup, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = url;
      link.download = `collabedge-board-${snapshot.board.id}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (caught) {
      setExportError(asError(caught, 'Board export failed. Please try again.'));
    } finally {
      setExporting(false);
    }
  }
  function dragEnd({ active, over }: DragEndEvent) {
    if (filtered || readOnly) return;
    if (!over || active.id === over.id) return;
    const targetCard = state.cards.find((c) => c.id === over.id);
    const destination = targetCard?.columnId ?? String(over.id);
    if (columns.some((c) => c.id === destination))
      live.mutate({
        type: 'card.move',
        payload: {
          id: String(active.id),
          columnId: destination,
          beforeId: targetCard?.id ?? null,
        },
      });
  }
  return (
    <div className="min-h-screen">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border bg-surface px-6 py-4">
        <Link href="/workspaces" className="brand">
          <Layers3 />
          CollabEdge
        </Link>
        <div className="flex items-center gap-3">
          <div className="flex -space-x-1">
            {live.presence.map((p) => {
              const viewedCard = state.cards.find(
                (card) => card.id === p.selectedCardId && !card.archived,
              );
              const detail =
                p.status === 'idle'
                  ? t('Idle')
                  : viewedCard
                    ? t('Viewing {title}', { title: viewedCard.title })
                    : t('Active');
              const label = `${p.displayName} · ${detail}`;
              return (
                <span
                  key={p.userId}
                  role="img"
                  aria-label={label}
                  title={label}
                  className={`avatar ${p.status === 'idle' ? 'opacity-50' : ''}`}
                >
                  {p.displayName.slice(0, 2).toUpperCase()}
                </span>
              );
            })}
          </div>
          <span
            role="status"
            aria-label={t('Connection status')}
            className="badge"
          >
            <span className="status-dot" />
            {t(live.status)}
          </span>
          <LanguageSelect />
          <ThemeToggle />
        </div>
      </header>
      <div className="motion-reveal flex flex-wrap items-center justify-between gap-4 border-b border-border px-6 py-6">
        <div>
          <Link
            href="/workspaces"
            className="mb-3 flex items-center gap-1 text-xs text-muted"
          >
            <ArrowLeft size={13} />
            {t('Workspace')}
          </Link>
          <h1
            data-board-heading
            tabIndex={-1}
            className="text-2xl font-semibold"
          >
            {state.board.name}
          </h1>
          <p className="mt-2 text-sm text-muted">
            {t('Make progress visible. Keep your team in sync.')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 whitespace-nowrap">
          {!readOnly && (
            <button
              className="button secondary"
              onClick={() => setSettings({ ...state.board })}
            >
              {t('Board settings')}
            </button>
          )}
          <span className="badge">
            {t('{role} · Revision {revision}', {
              role: t(live.role ?? initial.role),
              revision: state.board.revision,
            })}
          </span>
          <button
            className="button secondary"
            onClick={() => setShowActivity(!showActivity)}
          >
            <Activity size={16} />
            {t('Activity')}
          </button>
          <button
            className="button secondary"
            onClick={exportBoard}
            disabled={
              exporting ||
              live.status !== 'Connected' ||
              live.pending.length > 0
            }
            aria-busy={exporting}
            title={t('Exports current board data without attachment files.')}
          >
            <Download size={16} />
            {t('Export board JSON')}
          </button>
        </div>
      </div>
      <main className="p-4 sm:p-6">
        <ApiErrorNotice error={exportError} className="mb-4" />
        {state.board.archived && (
          <p className="notice mb-4">
            {t(
              'This board is archived. Its history and files remain available read-only.',
            )}
          </p>
        )}
        {state.board.archived && (live.role ?? initial.role) !== 'VIEWER' && (
          <button
            className="button mb-4"
            disabled={live.status !== 'Connected'}
            onClick={() =>
              live.mutate({
                type: 'board.restore',
                payload: { id: state.board.id },
              })
            }
          >
            {t('Restore board')}
          </button>
        )}
        <div className="surface motion-reveal motion-delay-1 mb-4 flex flex-wrap items-end gap-3 p-4">
          <label className="field flex-1">
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
              {initial.people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            {t('Filter by due date')}
            <select value={due} onChange={(e) => setDue(e.target.value)}>
              <option value="">{t('All dates')}</option>
              <option value="overdue">{t('Overdue')}</option>
              <option value="today">{t('Due today')}</option>
              <option value="upcoming">{t('Upcoming')}</option>
              <option value="none">{t('No due date')}</option>
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
          <button
            className="button secondary"
            onClick={() => setShowArchive(!showArchive)}
          >
            {t('Archived cards')}
          </button>
          {filtered && (
            <p className="w-full text-xs text-muted">
              {t('Clear filters to drag cards. Editing remains available.')}
            </p>
          )}
        </div>
        {showArchive && (
          <section
            className="surface motion-reveal mb-4 p-4"
            aria-label={t('Archived cards')}
          >
            <h2 className="font-semibold">{t('Archived cards')}</h2>
            {state.cards.filter((c) => c.archived).length === 0 && (
              <p>{t('No archived cards')}</p>
            )}
            {state.cards
              .filter((c) => c.archived)
              .map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <span>{c.title}</span>
                  {!readOnly && (
                    <button
                      className="button secondary"
                      aria-label={t('Restore {title}', { title: c.title })}
                      onClick={() =>
                        live.mutate({
                          type: 'card.restore',
                          payload: { id: c.id },
                        })
                      }
                    >
                      {t('Restore card')}
                    </button>
                  )}
                </div>
              ))}
          </section>
        )}
        {settings && !readOnly && (
          <BoardSettings
            initial={settings}
            mutate={live.mutate}
            close={() => setSettings(null)}
          />
        )}
        <ApiErrorNotice
          error={
            live.error &&
            (live.status === 'Access expired'
              ? new ApiError(live.error, 401, 'UNAUTHENTICATED')
              : live.error)
          }
          className="mb-4"
          retryLabel="Reconnect board"
          onRetry={live.reconnect}
        />
        {(drafts.error || live.draftError) && (
          <p role="alert" className="notice mb-4">
            {t(drafts.error || live.draftError)}
          </p>
        )}
        {drafts.drafts.length > 0 && (
          <section
            aria-label={t('Drafts on this device')}
            className="surface mb-4 space-y-3 p-4"
          >
            <h2 className="font-semibold">{t('Drafts on this device')}</h2>
            <p className="text-sm text-muted">
              {t(
                'Saved for seven days in this browser. Review a draft before sending it.',
              )}
            </p>
            {drafts.drafts.map((draft) => {
              const card = state.cards.find((item) => item.id === draft.cardId);
              return (
                <article
                  key={draft.id}
                  className="flex flex-wrap items-center gap-3"
                >
                  <div className="min-w-0 flex-1 text-sm">
                    <p>{draft.fields.title || t('Untitled draft')}</p>
                    <p className="line-clamp-1 text-xs text-muted">
                      {(draft.comment || draft.fields.description).slice(
                        0,
                        120,
                      )}
                    </p>
                  </div>
                  <time className="text-xs text-muted">
                    {new Date(draft.updatedAt).toLocaleString(locale)}
                  </time>
                  <button
                    className="button secondary"
                    disabled={!card}
                    aria-label={t('Review draft for {title}', {
                      title: draft.fields.title || t('Untitled draft'),
                    })}
                    onClick={() => {
                      if (card) {
                        setRestoredDraft(draft);
                        setSelected({ ...card });
                      }
                    }}
                  >
                    {t('Review draft')}
                  </button>
                  <button onClick={() => void drafts.discard(draft.id)}>
                    {t('Discard draft')}
                  </button>
                </article>
              );
            })}
          </section>
        )}
        {live.pending
          .filter((p) => p.state !== 'pending')
          .map((p) => (
            <div
              key={p.mutation.clientMutationId}
              role="alert"
              className="notice mb-4"
            >
              <strong>
                {t(
                  p.state === 'conflicted'
                    ? 'Edit conflict'
                    : p.state === 'recovered'
                      ? 'Recovered edit — review before sending'
                      : 'Could not save',
                )}
              </strong>
              <p className="my-2">{errorText(p.error)}</p>
              <pre className="overflow-auto text-xs whitespace-pre-wrap">
                {JSON.stringify(p.mutation.command.payload, null, 2)}
              </pre>
              <div className="mt-3 flex gap-4">
                <button
                  className="button secondary"
                  onClick={() => live.retry(p)}
                >
                  {t('Retry my draft')}
                </button>
                <button
                  onClick={() => live.dismiss(p.mutation.clientMutationId)}
                >
                  {t('Discard draft')}
                </button>
              </div>
            </div>
          ))}
        <DndContext
          sensors={sensors}
          onDragEnd={dragEnd}
          accessibility={{
            screenReaderInstructions: {
              draggable:
                locale === 'en'
                  ? 'Press Space to pick up a card, arrow keys to move, Space to drop, or Escape to cancel.'
                  : t('Drag instructions'),
            },
            announcements: {
              onDragStart: () => t('Picked up card.'),
              onDragOver: () => t('Card moved.'),
              onDragEnd: () => t('Card dropped.'),
              onDragCancel: () => t('Drag cancelled.'),
            },
          }}
        >
          <div className="flex min-h-96 gap-4 overflow-x-auto pb-10">
            {columns.map((column, index) => {
              const cards = state.cards
                .filter(
                  (c) =>
                    c.columnId === column.id &&
                    !c.archived &&
                    matchesCard(c, search, assignee, due, today),
                )
                .sort((a, b) => a.position - b.position);
              return (
                <Column key={column.id} column={column} index={index}>
                  <div className="mb-4 flex items-center gap-2 px-1">
                    <span className={`column-dot tone-${index % 4}`} />
                    <h2 className="flex-1 text-sm font-semibold">
                      {column.title}
                    </h2>
                    <span className="text-xs text-muted">{cards.length}</span>
                  </div>
                  {!readOnly && (
                    <details className="mb-3 text-xs text-muted">
                      <summary className="cursor-pointer">
                        {t('Column options')}
                      </summary>
                      <form
                        className="my-2 flex gap-2"
                        onSubmit={(e) => {
                          e.preventDefault();
                          live.mutate({
                            type: 'column.rename',
                            payload: {
                              id: column.id,
                              title: String(
                                new FormData(e.currentTarget).get('title'),
                              ),
                            },
                          });
                        }}
                      >
                        <input
                          aria-label={t('Rename {title}', {
                            title: column.title,
                          })}
                          name="title"
                          defaultValue={column.title}
                          required
                          maxLength={160}
                        />
                        <button>{t('Save')}</button>
                      </form>
                      <div className="flex flex-wrap gap-3">
                        <button
                          onClick={() =>
                            live.mutate({
                              type: 'column.move',
                              payload: {
                                id: column.id,
                                beforeId:
                                  columns[Math.max(0, index - 1)]?.id ?? null,
                              },
                            })
                          }
                        >
                          {t('Move left')}
                        </button>
                        <button
                          onClick={() =>
                            live.mutate({
                              type: 'column.move',
                              payload: {
                                id: column.id,
                                beforeId: columns[index + 2]?.id ?? null,
                              },
                            })
                          }
                        >
                          {t('Move right')}
                        </button>
                        <button
                          className="text-destructive"
                          onClick={() =>
                            live.mutate({
                              type: 'column.remove',
                              payload: { id: column.id },
                            })
                          }
                        >
                          {t('Remove empty column')}
                        </button>
                      </div>
                    </details>
                  )}
                  <SortableContext
                    items={cards.map((c) => c.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {cards.map((card) => (
                      <SortableCard
                        key={card.id}
                        card={card}
                        readOnly={readOnly || filtered}
                        people={initial.people}
                        open={() => {
                          setRestoredDraft(null);
                          setSelected({ ...card });
                        }}
                        pending={live.pending.some(
                          (p) =>
                            p.state === 'pending' &&
                            p.mutation.command.payload.id === card.id,
                        )}
                      />
                    ))}
                  </SortableContext>
                  {cards.length === 0 && (
                    <div className="mb-3 rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted">
                      {t(
                        filtered
                          ? 'No matching cards'
                          : 'Room for something new',
                      )}
                    </div>
                  )}
                  {!readOnly && (
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault();
                        const form = e.currentTarget;
                        if (
                          await live.mutate({
                            type: 'card.create',
                            payload: {
                              id: crypto.randomUUID(),
                              columnId: column.id,
                              title: String(new FormData(form).get('title')),
                            },
                          })
                        )
                          form.reset();
                      }}
                    >
                      <input
                        name="title"
                        aria-label={t('New card in {title}', {
                          title: column.title,
                        })}
                        placeholder={t('Add a card…')}
                        required
                        maxLength={160}
                      />
                      <button className="mt-2 flex items-center gap-1 text-xs text-muted">
                        <Plus size={14} />
                        {t('Add card')}
                      </button>
                    </form>
                  )}
                </Column>
              );
            })}
            {!readOnly && (
              <form
                className="w-64 shrink-0 p-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  if (
                    await live.mutate({
                      type: 'column.create',
                      payload: {
                        id: crypto.randomUUID(),
                        title: String(new FormData(form).get('title')),
                      },
                    })
                  )
                    form.reset();
                }}
              >
                <input
                  name="title"
                  aria-label={t('New column name')}
                  placeholder={t('New column…')}
                  required
                  maxLength={160}
                />
                <button className="mt-3 text-sm text-muted">
                  {t('+ Add column')}
                </button>
              </form>
            )}
          </div>
        </DndContext>
        <ActivityPanel
          boardId={state.board.id}
          open={showActivity}
          liveEvents={live.activity}
        />
      </main>
      {selected && (
        <CardDialog
          key={`${selected.id}:${restoredDraft?.id ?? 'new'}`}
          initial={selected}
          state={state}
          readOnly={readOnly || selected.archived}
          people={initial.people}
          mutate={live.mutate}
          reconnect={live.reconnect}
          connectionStatus={live.status}
          connectionError={live.error}
          ownerId={initial.user.id}
          draftLease={drafts.lease}
          restoredDraft={restoredDraft}
          close={() => {
            setSelected(null);
            setRestoredDraft(null);
          }}
        />
      )}
    </div>
  );
}
function BoardSettings({
  initial,
  mutate,
  close,
}: {
  initial: Snapshot['board'];
  mutate: (command: Command, base?: number) => Promise<boolean>;
  close: () => void;
}) {
  const { t } = useI18n();

  const [title, setTitle] = useState(initial.name);
  const [confirmArchive, setConfirmArchive] = useState(false);
  return (
    <section
      className="surface motion-reveal mb-4 space-y-4 p-5"
      aria-label={t('Board settings')}
    >
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={async (event) => {
          event.preventDefault();
          if (
            await mutate(
              { type: 'board.rename', payload: { id: initial.id, title } },
              initial.revision,
            )
          )
            close();
        }}
      >
        <label className="field">
          {t('Board name')}
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
            maxLength={160}
          />
        </label>
        <button className="button">{t('Save board name')}</button>
        <button type="button" className="button secondary" onClick={close}>
          {t('Cancel')}
        </button>
      </form>
      {confirmArchive ? (
        <div className="space-y-3">
          <p>
            {t(
              'Archive this board? It will become read-only and disappear from the workspace list. History is retained and still counts toward usage limits.',
            )}
          </p>
          <button
            className="button secondary"
            onClick={async () => {
              if (
                await mutate(
                  { type: 'board.archive', payload: { id: initial.id } },
                  initial.revision,
                )
              )
                close();
            }}
          >
            {t('Confirm archive board')}
          </button>
        </div>
      ) : (
        <button
          className="text-sm text-destructive"
          onClick={() => setConfirmArchive(true)}
        >
          {t('Archive board')}
        </button>
      )}
    </section>
  );
}
