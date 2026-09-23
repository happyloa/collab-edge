import type { Snapshot } from './protocol';
export function localToday(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
export function matchesCard(
  card: Snapshot['cards'][number],
  search: string,
  assignee: string,
  due: string,
  today: string,
) {
  if (
    search.trim() &&
    !`${card.title}\n${card.description}`
      .toLocaleLowerCase()
      .includes(search.trim().toLocaleLowerCase())
  )
    return false;
  if (
    assignee === 'unassigned'
      ? card.assigneeId !== null
      : assignee && card.assigneeId !== assignee
  )
    return false;
  if (due === 'none') return card.dueDate === null;
  if (due === 'overdue') return card.dueDate !== null && card.dueDate < today;
  if (due === 'today') return card.dueDate === today;
  if (due === 'upcoming') return card.dueDate !== null && card.dueDate > today;
  return true;
}
