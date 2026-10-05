import type { CardDraft, DraftFields } from './store';

// Keep the old baseline only for fields the author actually edited. Other
// fields follow the latest server snapshot and are omitted from the mutation.
export function restoreCardDraft(draft: CardDraft, current: DraftFields) {
  const original = { ...current };
  const fields = { ...current };
  const merge = <K extends keyof DraftFields>(key: K) => {
    if ((draft.fields[key] || null) !== (draft.original[key] || null)) {
      original[key] = draft.original[key];
      fields[key] = draft.fields[key];
    }
  };
  merge('title');
  merge('description');
  merge('assigneeId');
  merge('dueDate');
  return { original, fields };
}
