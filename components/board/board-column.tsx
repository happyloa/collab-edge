'use client';
import { useDroppable } from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Plus, GripVertical, MessageSquare } from 'lucide-react';
import { useI18n } from '../ui/i18n';
import type { Snapshot, Command } from '../../src/realtime/protocol';
import type { Pending } from '../../src/realtime/socket-client';
import type { BoardData, Card } from './types';

function SortableCard({
  card,
  readOnly,
  open,
  pending,
  people,
  commentCount,
}: {
  card: Card;
  readOnly: boolean;
  open: () => void;
  pending: boolean;
  people: BoardData['people'];
  commentCount: number;
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
          className="min-h-11 flex-1 text-left text-sm leading-relaxed font-medium"
          onClick={open}
        >
          {card.title}
        </button>
        {!readOnly && (
          <button
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-border"
            aria-label={t('Move {title}', { title: card.title })}
            {...attributes}
            {...listeners}
          >
            <GripVertical size={16} aria-hidden="true" />
          </button>
        )}
      </div>
      {card.description && (
        <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted">
          {card.description}
        </p>
      )}
      <div className="mt-5 flex items-center justify-between gap-2 text-xs text-muted">
        <span>CE–{card.id.slice(0, 4).toUpperCase()}</span>
        {pending && <span>{t('Saving…')}</span>}
        {commentCount > 0 && (
          <span
            role="img"
            aria-label={t('{count} comment(s)', { count: commentCount })}
            className="inline-flex items-center gap-1"
          >
            <MessageSquare size={13} aria-hidden="true" />
            <span aria-hidden="true">{commentCount}</span>
          </span>
        )}
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
      className={`motion-reveal w-72 shrink-0 rounded-xl p-2 ${isOver ? 'bg-border' : 'bg-surface-subtle'}`}
      style={{ animationDelay: `${Math.min(index, 5) * 70}ms` }}
    >
      {children}
    </section>
  );
}

/** One column: its options, sortable cards and the form that adds a card. */
export function BoardColumn({
  column,
  index,
  columns,
  cards,
  readOnly,
  filtered,
  people,
  commentCounts,
  pending,
  mutate,
  openCard,
}: {
  column: Snapshot['columns'][number];
  index: number;
  columns: Snapshot['columns'];
  cards: Card[];
  readOnly: boolean;
  filtered: boolean;
  people: BoardData['people'];
  commentCounts: Map<string, number>;
  pending: Pending[];
  mutate: (command: Command, base?: number) => Promise<boolean>;
  openCard: (card: Card) => void;
}) {
  const { t } = useI18n();
  return (
    <Column column={column} index={index}>
      <div className="mb-4 flex items-center gap-2 px-1">
        <span className={`column-dot tone-${index % 4}`} />
        <h2 className="flex-1 text-sm font-semibold">{column.title}</h2>
        <span className="text-xs text-muted">{cards.length}</span>
      </div>
      {!readOnly && (
        <details className="mb-3 text-xs text-muted">
          <summary className="cursor-pointer">{t('Column options')}</summary>
          <form
            className="my-2 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              mutate({
                type: 'column.rename',
                payload: {
                  id: column.id,
                  title: String(new FormData(e.currentTarget).get('title')),
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
                mutate({
                  type: 'column.move',
                  payload: {
                    id: column.id,
                    beforeId: columns[Math.max(0, index - 1)]?.id ?? null,
                  },
                })
              }
            >
              {t('Move left')}
            </button>
            <button
              onClick={() =>
                mutate({
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
                mutate({
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
            commentCount={commentCounts.get(card.id) ?? 0}
            readOnly={readOnly || filtered}
            people={people}
            open={() => openCard(card)}
            pending={pending.some(
              (p) =>
                p.state === 'pending' &&
                p.mutation.command.payload.id === card.id,
            )}
          />
        ))}
      </SortableContext>
      {cards.length === 0 && (
        <div className="mb-3 rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted">
          {t(filtered ? 'No matching cards' : 'Room for something new')}
        </div>
      )}
      {!readOnly && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            if (
              await mutate({
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
}
