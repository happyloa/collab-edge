'use client';
import { useI18n, LanguageSelect } from '../ui/i18n';
import Link from 'next/link';
import { useState, useRef, useEffect } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
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
  X,
  MessageSquare,
  ArrowLeft,
  Activity,
  Download,
} from 'lucide-react';
import { api } from '../ui/providers';
import { ThemeToggle } from '../ui/theme';
import { Attachments } from './attachments';
import { useBoard } from '../../src/realtime/socket-client';
import { matchesCard, localToday } from '../../src/realtime/card-filters';
import type {
  Snapshot,
  Command,
  BoardEvent,
} from '../../src/realtime/protocol';
type BoardData = {
  snapshot: Snapshot;
  role: string;
  user: { id: string; name: string };
  people: { id: string; name: string }[];
};
type Card = Snapshot['cards'][number];
type ActivityPage = { events: BoardEvent[]; nextBefore: number | null };
export function BoardLoader({ id }: { id: string }) {
  const { t, errorText } = useI18n();

  const query = useQuery({
    queryKey: ['board', id],
    queryFn: () => api<BoardData>(`/api/boards/${id}`),
  });
  if (query.error)
    return (
      <main className="p-10">
        <p role="alert" className="notice error">
          {errorText(query.error.message)}
        </p>
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
  return <Board key={id} initial={query.data} />;
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
  const [showActivity, setShowActivity] = useState(false);
  const history = useInfiniteQuery({
    queryKey: ['activity', initial.snapshot.board.id],
    enabled: showActivity,
    initialPageParam: undefined as number | undefined,
    queryFn: ({ pageParam }) =>
      api<ActivityPage>(
        `/api/boards/${initial.snapshot.board.id}/activity?limit=30${pageParam === undefined ? '' : `&before=${pageParam}`}`,
      ),
    getNextPageParam: (lastPage) => lastPage.nextBefore ?? undefined,
  });
  const live = useBoard(initial.snapshot, initial.user.id);
  const { state } = live;
  const activity = [
    ...new Map(
      [
        ...(history.data?.pages.flatMap((page) => page.events) ?? []),
        ...live.activity,
      ].map((event) => [event.eventId, event]),
    ).values(),
  ].sort((a, b) => b.revision - a.revision);
  const [selected, setSelected] = useState<Card | null>(null);
  const [search, setSearch] = useState('');
  const [assignee, setAssignee] = useState('');
  const [due, setDue] = useState('');
  const [showArchive, setShowArchive] = useState(false);
  const filtered = Boolean(search.trim() || assignee || due);
  const today = localToday();
  const [settings, setSettings] = useState<Snapshot['board'] | null>(null);
  const readOnly = initial.role === 'VIEWER' || state.board.archived;
  const columns = [...state.columns].sort((a, b) => a.position - b.position);
  const keyboardCoordinates: KeyboardCoordinateGetter = (event, args) => {
    // Target neighboring columns explicitly; the sortable getter can keep the
    // previous empty-column target when a keyboard drag reverses direction.
    if (event.code !== 'ArrowLeft' && event.code !== 'ArrowRight')
      return sortableKeyboardCoordinates(event, args);

    const { active, over, collisionRect, droppableRects } = args.context;
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
    const nextRect = nextColumn && droppableRects.get(nextColumn.id);
    if (!nextRect) return;

    return {
      x: nextRect.left + (nextRect.width - collisionRect.width) / 2,
      y: nextRect.top + (nextRect.height - collisionRect.height) / 2,
    };
  };
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: keyboardCoordinates,
    }),
  );
  function exportBoard() {
    if (live.status !== 'Connected' || live.pending.length > 0) return;
    const file = new Blob(
      [
        JSON.stringify(
          {
            format: 'collabedge.board.v1',
            exportedAt: new Date().toISOString(),
            snapshot: state,
            people: initial.people,
            attachmentContentsIncluded: false,
          },
          null,
          2,
        ),
      ],
      { type: 'application/json' },
    );
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = `collabedge-board-${state.board.id}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
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
            {live.presence.map((p) => (
              <span key={p.userId} title={p.displayName} className="avatar">
                {p.displayName.slice(0, 2).toUpperCase()}
              </span>
            ))}
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
          <h1 className="text-2xl font-semibold">{state.board.name}</h1>
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
              role: t(initial.role),
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
            disabled={live.status !== 'Connected' || live.pending.length > 0}
            title={t('Exports current board data without attachment files.')}
          >
            <Download size={16} />
            {t('Export board JSON')}
          </button>
        </div>
      </div>
      <main className="p-4 sm:p-6">
        {state.board.archived && (
          <p className="notice mb-4">
            {t(
              'This board is archived. Its history and files remain available read-only.',
            )}
          </p>
        )}
        {state.board.archived && initial.role !== 'VIEWER' && (
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
        {live.error && (
          <p role="alert" className="notice error mb-4">
            {errorText(live.error)}
          </p>
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
                  p.state === 'conflicted' ? 'Edit conflict' : 'Could not save',
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
                        open={() => setSelected({ ...card })}
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
                      onSubmit={(e) => {
                        e.preventDefault();
                        const form = e.currentTarget;
                        if (
                          live.mutate({
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
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  if (
                    live.mutate({
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
        {showActivity && (
          <section className="surface motion-reveal p-6">
            <h2 className="font-semibold">{t('Recent activity')}</h2>
            {history.isPending && (
              <p role="status" className="mt-3 text-sm text-muted">
                {t('Loading activity…')}
              </p>
            )}
            {history.error && (
              <div role="alert" className="notice error mt-3">
                {errorText(history.error.message)}
                <button
                  className="button secondary ml-3"
                  onClick={() => {
                    if (history.isFetchNextPageError)
                      void history.fetchNextPage();
                    else void history.refetch();
                  }}
                >
                  {t('Retry activity')}
                </button>
              </div>
            )}
            {!history.isPending && !history.error && activity.length === 0 && (
              <p className="mt-3 text-sm text-muted">
                {t('Board updates will appear here.')}
              </p>
            )}
            <ol className="mt-3 space-y-3">
              {activity.map((e) => (
                <li
                  key={e.eventId}
                  className="motion-reveal flex gap-4 text-sm"
                >
                  <span className="text-muted">#{e.revision}</span>
                  <span>
                    {locale === 'en' ? e.type.replace('.', ' · ') : t(e.type)}
                  </span>
                  <time className="ml-auto text-xs text-muted">
                    {new Date(e.createdAt).toLocaleTimeString(locale)}
                  </time>
                </li>
              ))}
            </ol>
            {history.hasNextPage && !history.error && (
              <button
                className="button secondary mt-4"
                disabled={history.isFetchingNextPage}
                onClick={() => void history.fetchNextPage()}
              >
                {history.isFetchingNextPage
                  ? t('Loading older activity…')
                  : t('Load older activity')}
              </button>
            )}
          </section>
        )}
      </main>
      {selected && (
        <CardDialog
          key={selected.id}
          initial={selected}
          state={state}
          readOnly={readOnly}
          people={initial.people}
          mutate={live.mutate}
          close={() => setSelected(null)}
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
  mutate: (command: Command, base?: number) => boolean;
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
        onSubmit={(event) => {
          event.preventDefault();
          if (
            mutate(
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
            onClick={() => {
              if (
                mutate(
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
function CardDialog({
  initial,
  state,
  readOnly,
  mutate,
  close,
  people,
}: {
  initial: Card;
  state: Snapshot;
  readOnly: boolean;
  mutate: (command: Command, base?: number) => boolean;
  close: () => void;
  people: BoardData['people'];
}) {
  const { t, locale } = useI18n();

  const dialog = useRef<HTMLDialogElement>(null);
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [assigneeId, setAssigneeId] = useState(initial.assigneeId ?? '');
  const [dueDate, setDueDate] = useState(initial.dueDate ?? '');
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [base] = useState(state.board.revision);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      onClose={close}
      className="motion-dialog m-auto max-h-11/12 w-full max-w-xl overflow-y-auto rounded-2xl border border-border bg-surface p-7 text-foreground shadow-panel backdrop:bg-black/40"
    >
      <div className="mb-6 flex items-center justify-between">
        <span className="eyebrow">{t('CARD DETAILS')}</span>
        <button
          className="icon-button"
          aria-label={t('Close card')}
          onClick={close}
        >
          <X size={20} />
        </button>
      </div>
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          const payload: {
            id: string;
            title?: string;
            description?: string;
            assigneeId?: string | null;
            dueDate?: string | null;
          } = { id: initial.id };
          if (title !== initial.title) payload.title = title;
          if (description !== initial.description)
            payload.description = description;
          if ((assigneeId || null) !== initial.assigneeId)
            payload.assigneeId = assigneeId || null;
          if ((dueDate || null) !== initial.dueDate)
            payload.dueDate = dueDate || null;
          if (Object.keys(payload).length === 1) return;
          if (mutate({ type: 'card.update', payload }, base)) close();
        }}
      >
        <label className="field">
          {t('Title')}
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={160}
            disabled={readOnly}
          />
        </label>
        <label className="field">
          {t('Description')}
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={10000}
            disabled={readOnly}
          />
        </label>
        <label className="field">
          {t('Assignee')}
          <select
            aria-label={t('Assignee')}
            disabled={readOnly}
            value={assigneeId}
            onChange={(e) => setAssigneeId(e.target.value)}
          >
            <option value="">{t('Unassigned')}</option>
            {assigneeId && !people.some((p) => p.id === assigneeId) && (
              <option value={assigneeId}>{t('Former member')}</option>
            )}
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          {t('Due date')}
          <input
            type="date"
            disabled={readOnly}
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </label>
        {!readOnly && (
          <div className="flex flex-wrap justify-between gap-3">
            <button className="button">{t('Save changes')}</button>
            <button
              type="button"
              className="text-sm text-destructive"
              onClick={() => {
                if (!confirmArchive) {
                  setConfirmArchive(true);
                  return;
                }
                if (
                  mutate(
                    { type: 'card.archive', payload: { id: initial.id } },
                    base,
                  )
                )
                  close();
              }}
            >
              {t(confirmArchive ? 'Confirm archive card' : 'Archive card')}
            </button>
            {confirmArchive && (
              <button type="button" onClick={() => setConfirmArchive(false)}>
                {t('Cancel')}
              </button>
            )}
          </div>
        )}
      </form>
      {!readOnly && (
        <label className="field mt-6">
          {t('Move to')}
          <select
            value={
              state.cards.find((c) => c.id === initial.id)?.columnId ??
              initial.columnId
            }
            onChange={(e) =>
              mutate({
                type: 'card.move',
                payload: {
                  id: initial.id,
                  columnId: e.target.value,
                  beforeId: null,
                },
              })
            }
          >
            {state.columns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </label>
      )}
      <section className="mt-8 border-t border-border pt-6">
        <h2 className="font-semibold">{t('Conversation')}</h2>
        <ul className="my-4 space-y-3">
          {state.comments
            .filter((c) => c.cardId === initial.id)
            .map((c) => (
              <li key={c.id} className="rounded-lg bg-background p-3 text-sm">
                <p className="whitespace-pre-wrap">{c.body}</p>
                <time className="mt-2 block text-xs text-muted">
                  {new Date(c.createdAt).toLocaleString(locale)}
                </time>
              </li>
            ))}
        </ul>
        {!readOnly && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              if (
                mutate({
                  type: 'comment.create',
                  payload: {
                    id: crypto.randomUUID(),
                    cardId: initial.id,
                    body: String(new FormData(form).get('body')),
                  },
                })
              )
                form.reset();
            }}
          >
            <label className="field">
              {t('Add a comment')}
              <textarea name="body" required maxLength={2000} />
            </label>
            <button className="button secondary mt-3">
              {t('Post comment')}
            </button>
          </form>
        )}
      </section>
      <Attachments
        cardId={initial.id}
        items={state.attachments}
        readOnly={readOnly}
      />
    </dialog>
  );
}
