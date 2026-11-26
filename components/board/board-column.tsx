'use client';
import { memo } from 'react';
import { useDroppable } from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Plus,
  GripVertical,
  MessageSquare,
  MoreHorizontal,
} from 'lucide-react';
import { useI18n } from '../ui/i18n';
import type { Snapshot, Command } from '../../src/realtime/protocol';
import type { Pending } from '../../src/realtime/socket-client';
import type { BoardData, Card } from './types';

const SortableCard = memo(function SortableCard({
  card,
  readOnly,
  open,
  pending,
  people,
  commentCount,
}: {
  card: Card;
  readOnly: boolean;
  open: (card: Card) => void;
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
      className="surface sortable-surface mb-2 px-3 pt-1 pb-3"
    >
      <div className="flex items-start gap-1">
        <button
          className="min-h-11 flex-1 py-2 text-left text-sm leading-snug font-medium"
          onClick={() => open(card)}
        >
          {card.title}
        </button>
        {!readOnly && (
          <button
            className="-mr-2 inline-flex size-11 shrink-0 cursor-grab items-center justify-center rounded-md text-control-border hover:bg-surface-subtle hover:text-foreground"
            aria-label={t('Move {title}', { title: card.title })}
            {...attributes}
            {...listeners}
          >
            <GripVertical size={16} aria-hidden="true" />
          </button>
        )}
      </div>
      {card.description && (
        <p className="line-clamp-2 text-xs leading-relaxed text-muted">
          {card.description}
        </p>
      )}
      <div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted">
        <span className="font-mono text-[0.6875rem]">
          CE–{card.id.slice(0, 4).toUpperCase()}
        </span>
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
        <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
          {card.assigneeId && (
            <span className="tag">
              {people.find((p) => p.id === card.assigneeId)?.name ??
                t('Former member')}
            </span>
          )}
          {card.dueDate && (
            <time className="tag font-mono" dateTime={card.dueDate}>
              {card.dueDate}
            </time>
          )}
        </div>
      )}
    </div>
  );
});
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
      className={`w-72 shrink-0 rounded-lg px-2 pb-2 ${isOver ? 'bg-surface-subtle' : ''}`}
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
    <Column column={column}>
      <div className="relative mb-3 flex min-h-11 items-center gap-2 border-t-2 border-foreground pt-1 pl-1">
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">
          {column.title}
        </h2>
        <span className="font-mono text-xs text-muted">{cards.length}</span>
        {!readOnly && (
          <details className="column-options text-xs text-muted">
            <summary
              className="icon-button size-9 cursor-pointer list-none"
              aria-label={t('Column options')}
              title={t('Column options')}
            >
              <MoreHorizontal size={16} aria-hidden="true" />
            </summary>
            <div className="surface absolute top-full right-0 z-10 mt-1 w-64 p-3 shadow-float">
              <form
                className="mb-3 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void mutate({
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
                <button type="submit">{t('Save')}</button>
              </form>
              <div className="flex flex-wrap gap-3">
                <button
                  disabled={index === 0}
                  onClick={() =>
                    mutate({
                      type: 'column.move',
                      payload: {
                        id: column.id,
                        beforeId: columns[index - 1]?.id ?? null,
                      },
                    })
                  }
                >
                  {t('Move left')}
                </button>
                <button
                  disabled={index === columns.length - 1}
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
            </div>
          </details>
        )}
      </div>
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
            open={openCard}
            pending={pending.some(
              (p) =>
                p.state === 'pending' &&
                p.mutation.command.payload.id === card.id,
            )}
          />
        ))}
      </SortableContext>
      {cards.length === 0 && (
        <div className="mb-2 px-1 py-4 text-xs text-muted">
          {t(filtered ? 'No matching cards' : 'No cards')}
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
          <div className="flex items-center gap-1">
            <input
              name="title"
              className="border-dashed bg-transparent text-sm"
              aria-label={t('New card in {title}', {
                title: column.title,
              })}
              placeholder={t('Add a card…')}
              required
              maxLength={160}
            />
            <button
              type="submit"
              className="icon-button shrink-0"
              aria-label={t('Add card')}
              title={t('Add card')}
            >
              <Plus size={16} aria-hidden="true" />
            </button>
          </div>
        </form>
      )}
    </Column>
  );
}
