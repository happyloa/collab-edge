'use client';
import Link from 'next/link';
import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
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
} from 'lucide-react';
import { api } from '../ui/providers';
import { ThemeToggle } from '../ui/theme';
import { Attachments } from './attachments';
import { useBoard } from '../../src/realtime/socket-client';
import type {
  Snapshot,
  Command,
  BoardEvent,
} from '../../src/realtime/protocol';
type BoardData = {
  snapshot: Snapshot;
  role: string;
  user: { id: string; name: string };
};
type Card = Snapshot['cards'][number];
export function BoardLoader({ id }: { id: string }) {
  const query = useQuery({
    queryKey: ['board', id],
    queryFn: () => api<BoardData>(`/api/boards/${id}`),
  });
  if (query.error)
    return (
      <main className="p-10">
        <p role="alert" className="notice error">
          {query.error.message}
        </p>
        <Link href="/workspaces">Back to workspaces</Link>
      </main>
    );
  if (!query.data)
    return (
      <main className="p-10">
        <div role="status" className="surface h-60 animate-pulse p-6">
          Opening your shared space…
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
}: {
  card: Card;
  readOnly: boolean;
  open: () => void;
  pending: boolean;
}) {
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
      className="surface mb-3 p-4"
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
            aria-label={`Move ${card.title}`}
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
        <span>{pending ? 'Saving…' : <MessageSquare size={13} />}</span>
      </div>
    </div>
  );
}
function Column({
  column,
  children,
}: {
  column: Snapshot['columns'][number];
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  return (
    <section
      ref={setNodeRef}
      aria-label={column.title}
      className={`w-72 shrink-0 rounded-xl p-2 ${isOver ? 'bg-border' : ''}`}
    >
      {children}
    </section>
  );
}
function Board({ initial }: { initial: BoardData }) {
  const history = useQuery({
    queryKey: ['activity', initial.snapshot.board.id],
    queryFn: () =>
      api<BoardEvent[]>(`/api/boards/${initial.snapshot.board.id}/activity`),
  });
  const live = useBoard(initial.snapshot, initial.user.id);
  const { state } = live;
  const activity = [
    ...new Map(
      [...(history.data ?? []), ...live.activity].map((event) => [
        event.eventId,
        event,
      ]),
    ).values(),
  ]
    .sort((a, b) => b.revision - a.revision)
    .slice(0, 30);
  const [selected, setSelected] = useState<Card | null>(null);
  const [showActivity, setShowActivity] = useState(false);
  const readOnly = initial.role === 'VIEWER';
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const columns = [...state.columns].sort((a, b) => a.position - b.position);
  function dragEnd({ active, over }: DragEndEvent) {
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
          <span role="status" aria-label="Connection status" className="badge">
            <span className="status-dot" />
            {live.status}
          </span>
          <ThemeToggle />
        </div>
      </header>
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-6 py-6">
        <div>
          <Link
            href="/workspaces"
            className="mb-3 flex items-center gap-1 text-xs text-muted"
          >
            <ArrowLeft size={13} />
            Workspace
          </Link>
          <h1 className="text-2xl font-semibold">{state.board.name}</h1>
          <p className="mt-2 text-sm text-muted">
            Make progress visible. Keep your team in sync.
          </p>
        </div>
        <div className="flex gap-3">
          <span className="badge">
            {initial.role} · Revision {state.board.revision}
          </span>
          <button
            className="button secondary"
            onClick={() => setShowActivity(!showActivity)}
          >
            <Activity size={16} />
            Activity
          </button>
        </div>
      </div>
      <main className="p-4 sm:p-6">
        {live.error && (
          <p role="alert" className="notice error mb-4">
            {live.error}
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
                {p.state === 'conflicted' ? 'Edit conflict' : 'Could not save'}
              </strong>
              <p className="my-2">{p.error}</p>
              <pre className="overflow-auto text-xs whitespace-pre-wrap">
                {JSON.stringify(p.mutation.command.payload, null, 2)}
              </pre>
              <div className="mt-3 flex gap-4">
                <button
                  className="button secondary"
                  onClick={() => live.retry(p)}
                >
                  Retry my draft
                </button>
                <button
                  onClick={() => live.dismiss(p.mutation.clientMutationId)}
                >
                  Discard draft
                </button>
              </div>
            </div>
          ))}
        <DndContext sensors={sensors} onDragEnd={dragEnd}>
          <div className="flex min-h-96 gap-4 overflow-x-auto pb-10">
            {columns.map((column, index) => {
              const cards = state.cards
                .filter((c) => c.columnId === column.id && !c.archived)
                .sort((a, b) => a.position - b.position);
              return (
                <Column key={column.id} column={column}>
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
                        Column options
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
                          aria-label={`Rename ${column.title}`}
                          name="title"
                          defaultValue={column.title}
                          required
                          maxLength={160}
                        />
                        <button>Save</button>
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
                          Move left
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
                          Move right
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
                          Remove empty column
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
                        readOnly={readOnly}
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
                      Room for something new
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
                        aria-label={`New card in ${column.title}`}
                        placeholder="Add a card…"
                        required
                        maxLength={160}
                      />
                      <button className="mt-2 flex items-center gap-1 text-xs text-muted">
                        <Plus size={14} />
                        Add card
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
                  aria-label="New column name"
                  placeholder="New column…"
                  required
                  maxLength={160}
                />
                <button className="mt-3 text-sm text-muted">
                  + Add column
                </button>
              </form>
            )}
          </div>
        </DndContext>
        {showActivity && (
          <section className="surface p-6">
            <h2 className="font-semibold">Recent activity</h2>
            {activity.length === 0 && (
              <p className="mt-3 text-sm text-muted">
                Board updates will appear here.
              </p>
            )}
            <ol className="mt-3 space-y-3">
              {activity.map((e) => (
                <li key={e.eventId} className="flex gap-4 text-sm">
                  <span className="text-muted">#{e.revision}</span>
                  <span>{e.type.replace('.', ' · ')}</span>
                  <time className="ml-auto text-xs text-muted">
                    {new Date(e.createdAt).toLocaleTimeString()}
                  </time>
                </li>
              ))}
            </ol>
          </section>
        )}
      </main>
      {selected && (
        <CardDialog
          key={selected.id}
          initial={selected}
          state={state}
          readOnly={readOnly}
          mutate={live.mutate}
          close={() => setSelected(null)}
        />
      )}
    </div>
  );
}
function CardDialog({
  initial,
  state,
  readOnly,
  mutate,
  close,
}: {
  initial: Card;
  state: Snapshot;
  readOnly: boolean;
  mutate: (command: Command, base?: number) => boolean;
  close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [base] = useState(state.board.revision);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      onClose={close}
      className="m-auto max-h-11/12 w-full max-w-xl overflow-y-auto rounded-2xl border border-border bg-surface p-7 text-foreground shadow-panel backdrop:bg-black/40"
    >
      <div className="mb-6 flex items-center justify-between">
        <span className="eyebrow">CARD DETAILS</span>
        <button className="icon-button" aria-label="Close card" onClick={close}>
          <X size={20} />
        </button>
      </div>
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          const payload: { id: string; title?: string; description?: string } =
            { id: initial.id };
          if (title !== initial.title) payload.title = title;
          if (description !== initial.description)
            payload.description = description;
          if (payload.title === undefined && payload.description === undefined)
            return;
          if (mutate({ type: 'card.update', payload }, base)) close();
        }}
      >
        <label className="field">
          Title
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={160}
            disabled={readOnly}
          />
        </label>
        <label className="field">
          Description
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={10000}
            disabled={readOnly}
          />
        </label>
        {!readOnly && (
          <div className="flex justify-between">
            <button className="button">Save changes</button>
            <button
              type="button"
              className="text-sm text-destructive"
              onClick={() => {
                if (
                  mutate(
                    { type: 'card.archive', payload: { id: initial.id } },
                    base,
                  )
                )
                  close();
              }}
            >
              Archive card
            </button>
          </div>
        )}
      </form>
      {!readOnly && (
        <label className="field mt-6">
          Move to
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
        <h2 className="font-semibold">Conversation</h2>
        <ul className="my-4 space-y-3">
          {state.comments
            .filter((c) => c.cardId === initial.id)
            .map((c) => (
              <li key={c.id} className="rounded-lg bg-background p-3 text-sm">
                <p className="whitespace-pre-wrap">{c.body}</p>
                <time className="mt-2 block text-xs text-muted">
                  {new Date(c.createdAt).toLocaleString()}
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
              Add a comment
              <textarea name="body" required maxLength={2000} />
            </label>
            <button className="button secondary mt-3">Post comment</button>
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
