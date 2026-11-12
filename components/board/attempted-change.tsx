'use client';
import { useI18n } from '../ui/i18n';
import type { Snapshot, Command } from '../../src/realtime/protocol';
import type { BoardData } from './types';

/** Describes a change that could not be saved, in the reader's language. */
export function AttemptedChange({
  command,
  state,
  people,
}: {
  command: Command;
  state: Snapshot;
  people: BoardData['people'];
}) {
  const { t } = useI18n();
  const rows: { label: string; value: string }[] = [];
  const add = (label: string, value: string) => {
    rows.push({ label, value: value || t('Empty') });
  };
  const cardName = (id: string) =>
    state.cards.find((card) => card.id === id)?.title ?? t('Card unavailable');
  const columnName = (id: string) =>
    state.columns.find((column) => column.id === id)?.title ??
    t('Column unavailable');
  const action = {
    'board.rename': 'Rename board',
    'board.archive': 'Archive board',
    'board.restore': 'Restore board',
    'column.create': 'Create column',
    'column.rename': 'Rename column',
    'column.move': 'Move column',
    'column.remove': 'Remove empty column',
    'card.create': 'Create card',
    'card.update': 'Edit card',
    'card.move': 'Move card',
    'card.archive': 'Archive card',
    'card.restore': 'Restore card',
    'comment.create': 'Post comment',
  }[command.type];

  switch (command.type) {
    case 'board.rename':
    case 'column.create':
      add('Title', command.payload.title);
      break;
    case 'column.rename':
      add('Column', columnName(command.payload.id));
      add('Title', command.payload.title);
      break;
    case 'column.move':
    case 'column.remove':
      add('Column', columnName(command.payload.id));
      if (command.type === 'column.move')
        add(
          'Position',
          command.payload.beforeId
            ? t('Before {title}', {
                title: columnName(command.payload.beforeId),
              })
            : t('At end'),
        );
      break;
    case 'card.create':
      add('Title', command.payload.title);
      add('Destination column', columnName(command.payload.columnId));
      break;
    case 'card.update':
      add('Card', cardName(command.payload.id));
      if (command.payload.title !== undefined)
        add('Title', command.payload.title);
      if (command.payload.description !== undefined)
        add('Description', command.payload.description);
      if (command.payload.assigneeId !== undefined)
        add(
          'Assignee',
          command.payload.assigneeId
            ? (people.find((person) => person.id === command.payload.assigneeId)
                ?.name ?? t('Former member'))
            : t('Unassigned'),
        );
      if (command.payload.dueDate !== undefined)
        add('Due date', command.payload.dueDate ?? t('No due date'));
      break;
    case 'card.move':
      add('Card', cardName(command.payload.id));
      add('Destination column', columnName(command.payload.columnId));
      add(
        'Position',
        command.payload.beforeId
          ? t('Before {title}', { title: cardName(command.payload.beforeId) })
          : t('At end'),
      );
      break;
    case 'card.archive':
    case 'card.restore':
      add('Card', cardName(command.payload.id));
      break;
    case 'comment.create':
      add('Card', cardName(command.payload.cardId));
      add('Comment', command.payload.body);
      break;
  }

  return (
    <div className="text-sm">
      <p className="font-medium">{t(action)}</p>
      {rows.length > 0 && (
        <dl className="mt-2 space-y-2">
          {rows.map(({ label, value }) => (
            <div key={label}>
              <dt className="text-xs font-medium text-muted">{t(label)}</dt>
              <dd className="break-words whitespace-pre-wrap">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
