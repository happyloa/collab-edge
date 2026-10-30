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
  type DragEndEvent,
  type KeyboardCoordinateGetter,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { ArrowLeft, Activity, Download } from 'lucide-react';
import { api } from '../ui/providers';
import { ApiErrorNotice } from '../ui/api-error-notice';
import { ApiError } from '../../src/lib/api-client';
import { ThemeToggle } from '../ui/theme';
import { BrandMark } from '../ui/brand-mark';
import { ConnectionStatus } from '../ui/connection-status';
import { CardDialog } from './card-dialog';
import { ActivityPanel } from './activity-panel';
import { AttemptedChange } from './attempted-change';
import { BoardColumn } from './board-column';
import { BoardFilters } from './board-filters';
import { BoardSettings } from './board-settings';
import { useBoardExport } from './use-board-export';
import type { BoardData, Card } from './types';
import { useBoardDrafts } from './use-board-drafts';
import { useCardMovement } from './use-card-movement';
import type { CardDraft } from '../../src/drafts/store';
import { useBoard } from '../../src/realtime/socket-client';
import { matchesCard, localToday } from '../../src/realtime/card-filters';
import type { Snapshot } from '../../src/realtime/protocol';
function focusCardDialogClose(button: HTMLButtonElement) {
  button
    .closest('dialog')
    ?.querySelector<HTMLButtonElement>('[data-card-dialog-close]')
    ?.focus();
}
export function BoardLoader({
  id,
  attachmentsEnabled,
}: {
  id: string;
  attachmentsEnabled: boolean;
}) {
  const { t } = useI18n();

  const query = useQuery({
    queryKey: ['board', id],
    queryFn: ({ signal }) => api<BoardData>(`/api/boards/${id}`, { signal }),
  });
  if (query.error && !query.data)
    return (
      <main id="main-content" tabIndex={-1} className="p-10">
        <ApiErrorNotice
          error={query.error}
          onRetry={() => void query.refetch()}
        />
        <Link href="/workspaces">{t('Back to workspaces')}</Link>
      </main>
    );
  if (!query.data)
    return (
      <main id="main-content" tabIndex={-1} className="p-10">
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
      <Board
        key={`${id}:${query.data.user.id}`}
        initial={query.data}
        attachmentsEnabled={attachmentsEnabled}
      />
    </>
  );
}
function Board({
  initial,
  attachmentsEnabled,
}: {
  initial: BoardData;
  attachmentsEnabled: boolean;
}) {
  const { t, errorText, locale } = useI18n();
  const [selected, setSelected] = useState<Card | null>(null);
  const [restoredDraft, setRestoredDraft] = useState<CardDraft | null>(null);
  const openCard = useCallback((card: Card) => {
    setRestoredDraft(null);
    setSelected({ ...card });
  }, []);
  const drafts = useBoardDrafts(initial.user.id, initial.snapshot.board.id);
  const [showActivity, setShowActivity] = useState(false);
  const live = useBoard(
    initial.snapshot,
    initial.user.id,
    selected?.id,
    drafts.lease,
  );
  const { state } = live;
  const movement = useCardMovement(live, initial.user.id, state);
  const [search, setSearch] = useState('');
  const [assignee, setAssignee] = useState('');
  const [due, setDue] = useState('');
  const [showArchive, setShowArchive] = useState(false);
  const filtered = Boolean(search.trim() || assignee || due);
  const activeFilterCount =
    Number(Boolean(search.trim())) +
    Number(Boolean(assignee)) +
    Number(Boolean(due));
  const today = localToday();
  const [settings, setSettings] = useState<Snapshot['board'] | null>(null);
  const readOnly =
    (live.role ?? initial.role) === 'VIEWER' || state.board.archived;
  const columns = useMemo(
    () => [...state.columns].sort((a, b) => a.position - b.position),
    [state.columns],
  );
  const commentCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const comment of state.comments)
      counts.set(comment.cardId, (counts.get(comment.cardId) ?? 0) + 1);
    return counts;
  }, [state.comments]);
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
  const canExport = live.status === 'Connected' && live.pending.length === 0;
  const { exporting, exportError, exportBoard } = useBoardExport(
    state,
    initial.people,
    canExport,
  );
  function dragEnd({ active, over }: DragEndEvent) {
    if (filtered || readOnly) return;
    if (!over || active.id === over.id) return;
    const targetCard = state.cards.find((c) => c.id === over.id);
    const destination = targetCard?.columnId ?? String(over.id);
    if (columns.some((c) => c.id === destination))
      void movement.move({
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
          <BrandMark />
        </Link>
        <div className="flex flex-wrap items-center gap-3">
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
          <ConnectionStatus status={live.status} />
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
            {t(
              live.status !== 'Connected' || live.pending.length > 0
                ? 'Connect and finish pending edits before exporting.'
                : 'Make progress visible. Keep your team in sync.',
            )}
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
            disabled={exporting || !canExport}
            aria-busy={exporting}
            title={t('Exports current board data without attachment files.')}
          >
            <Download size={16} />
            {t('Export board JSON')}
          </button>
        </div>
      </div>
      <main id="main-content" tabIndex={-1} className="p-4 sm:p-6">
        {live.pending.some((item) => item.state === 'pending') && (
          <p className="notice mb-4" role="status">
            {t('{count} change(s) awaiting confirmation.', {
              count: live.pending.filter((item) => item.state === 'pending')
                .length,
            })}
          </p>
        )}
        <ApiErrorNotice error={exportError} className="mb-4" />
        {(live.role ?? initial.role) === 'VIEWER' && (
          <p className="notice mb-4">
            {t(
              'You can view this board, but your role does not allow editing.',
            )}
          </p>
        )}
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
        <BoardFilters
          search={search}
          assignee={assignee}
          due={due}
          onSearch={setSearch}
          onAssignee={setAssignee}
          onDue={setDue}
          people={initial.people}
          filtered={filtered}
          activeFilterCount={activeFilterCount}
          onToggleArchive={() => setShowArchive(!showArchive)}
        />
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
            className="surface attention mb-4 space-y-3 p-4"
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
              className="notice attention mb-4"
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
              <AttemptedChange
                command={p.mutation.command}
                state={state}
                people={initial.people}
              />
              <div className="mt-3 flex flex-wrap gap-4">
                {p.state === 'conflicted' &&
                  p.mutation.command.type === 'card.update' &&
                  (() => {
                    const card = state.cards.find(
                      (item) => item.id === p.mutation.command.payload.id,
                    );
                    return card ? (
                      <button
                        className="button secondary"
                        onClick={() => {
                          setRestoredDraft(null);
                          setSelected({ ...card });
                        }}
                      >
                        {t('Review draft')}
                      </button>
                    ) : null;
                  })()}
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
              onDragStart: ({ active }) =>
                t('Picked up {title}.', {
                  title:
                    state.cards.find((card) => card.id === active.id)?.title ??
                    t('Card'),
                }),
              onDragOver: ({ over }) => movement.destination(over?.id),
              onDragEnd: ({ over }) =>
                over
                  ? movement.destination(over.id)
                  : t('Move cancelled. No destination selected.'),
              onDragCancel: () => t('Drag cancelled.'),
            },
          }}
        >
          <div
            className="flex min-h-96 gap-4 overflow-x-auto pb-10"
            role="region"
            aria-label={t('Board columns')}
          >
            {columns.map((column, index) => (
              <BoardColumn
                key={column.id}
                column={column}
                index={index}
                columns={columns}
                cards={state.cards
                  .filter(
                    (c) =>
                      c.columnId === column.id &&
                      !c.archived &&
                      matchesCard(c, search, assignee, due, today),
                  )
                  .sort((a, b) => a.position - b.position)}
                readOnly={readOnly}
                filtered={filtered}
                people={initial.people}
                commentCounts={commentCounts}
                pending={live.pending}
                mutate={live.mutate}
                openCard={openCard}
              />
            ))}
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
        <p role="status" aria-label={t('Card movement')} className="sr-only">
          {selected ? '' : movement.message}
        </p>
        <ActivityPanel
          boardId={state.board.id}
          open={showActivity}
          liveEvents={live.activity}
          isOwner={(live.role ?? initial.role) === 'OWNER'}
          canOperate={live.status === 'Connected' && live.pending.length === 0}
        />
      </main>
      {selected && (
        <CardDialog
          key={`${selected.id}:${restoredDraft?.id ?? 'new'}`}
          initial={selected}
          state={state}
          readOnly={readOnly || selected.archived}
          attachmentsEnabled={attachmentsEnabled}
          pending={live.pending}
          moveCard={movement.move}
          moveMessage={movement.cardId === selected.id ? movement.message : ''}
          people={initial.people}
          mutate={live.mutate}
          reconnect={live.reconnect}
          connectionStatus={live.status}
          connectionError={live.error}
          ownerId={initial.user.id}
          draftLease={drafts.lease}
          restoredDraft={restoredDraft}
          attention={live.pending
            .filter(
              (p) =>
                p.state === 'conflicted' &&
                p.mutation.command.type === 'card.update' &&
                p.mutation.command.payload.id === selected.id,
            )
            .map((p) => (
              <div
                key={p.mutation.clientMutationId}
                role="alert"
                className="notice attention mb-4"
              >
                <strong>{t('Edit conflict')}</strong>
                <p className="my-2">{errorText(p.error)}</p>
                <AttemptedChange
                  command={p.mutation.command}
                  state={state}
                  people={initial.people}
                />
                <div className="mt-3 flex flex-wrap gap-4">
                  <button
                    className="button secondary"
                    onClick={(event) => {
                      focusCardDialogClose(event.currentTarget);
                      void live.retry(p);
                    }}
                  >
                    {t('Retry my draft')}
                  </button>
                  <button
                    onClick={(event) => {
                      focusCardDialogClose(event.currentTarget);
                      void live.dismiss(p.mutation.clientMutationId);
                    }}
                  >
                    {t('Discard draft')}
                  </button>
                </div>
              </div>
            ))}
          close={() => {
            setSelected(null);
            setRestoredDraft(null);
          }}
        />
      )}
    </div>
  );
}
