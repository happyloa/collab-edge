import type { Snapshot } from '../../src/realtime/protocol';
import type { Pending } from '../../src/realtime/socket-client';

export type CardField = 'title' | 'description' | 'assigneeId' | 'dueDate';
export function cardFieldStatus({
  field,
  value,
  original,
  current,
  pending,
  busy,
  saveStatus,
}: {
  field: CardField;
  value: string | null;
  original: string | null;
  current: Snapshot['cards'][number];
  pending: Pending[];
  busy: boolean;
  saveStatus: string;
}) {
  const submission = [...pending]
    .reverse()
    .find(
      (item) =>
        item.mutation.command.type === 'card.update' &&
        item.mutation.command.payload.id === current.id &&
        item.mutation.command.payload[field] !== undefined,
    );
  if (submission?.state === 'conflicted')
    return 'Conflicting submission. Review your attempted value.';
  if (submission && submission.state !== 'pending')
    return 'Submission needs review. Your attempted value is preserved.';
  if (busy && value !== original) return 'Submitting changes…';
  if (
    submission?.mutation.command.type === 'card.update' &&
    submission.mutation.command.payload[field] === value
  )
    return 'Waiting for server confirmation.';
  if (value !== original)
    return saveStatus === 'Draft saved on this device.'
      ? 'Saved on this device. Not yet submitted.'
      : saveStatus ||
          'Draft storage is unavailable. Keep this tab open or copy your edits.';
  return value === current[field]
    ? 'Server-confirmed value.'
    : 'The server value changed. Review before submitting.';
}
