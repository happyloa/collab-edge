import type { Snapshot } from '../src/realtime/protocol';
import { localToday } from '../src/realtime/card-filters';

export const people = [
  { id: '00000000-0000-4000-8000-000000000001', name: 'Alice' },
  { id: '00000000-0000-4000-8000-000000000002', name: 'Bob' },
];
export function fixture(): Snapshot {
  const boardId = crypto.randomUUID();
  const columns = ['Backlog', 'In Progress', 'Done'].map((title, position) => ({
    id: crypto.randomUUID(),
    boardId,
    title,
    position,
    updatedRevision: 0,
    titleRevision: 0,
  }));
  return {
    board: {
      id: boardId,
      workspaceId: crypto.randomUUID(),
      name: 'Website Launch',
      revision: 0,
      nameRevision: 0,
      archived: false,
    },
    columns,
    cards: [
      'Write the launch story',
      'Build a shared workspace',
      'Design the visual identity',
    ].map((title, index) => ({
      id: crypto.randomUUID(),
      boardId,
      columnId: columns[index].id,
      title,
      description:
        'Open this card to edit, assign a teammate, or try a conflicting edit.',
      position: 0,
      archived: false,
      updatedRevision: 0,
      titleRevision: 0,
      descriptionRevision: 0,
      assigneeId: people[index % 2].id,
      dueDate: index === 0 ? localToday() : null,
      assigneeRevision: 0,
      dueDateRevision: 0,
    })),
    comments: [],
    attachments: [],
  };
}
