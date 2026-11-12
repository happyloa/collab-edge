'use client';
import { useState } from 'react';
import { useI18n } from '../ui/i18n';
import type { BoardData } from './types';

/** Search, assignee and due-date filters plus the archived-card toggle. */
export function BoardFilters({
  search,
  assignee,
  due,
  onSearch,
  onAssignee,
  onDue,
  people,
  filtered,
  activeFilterCount,
  onToggleArchive,
}: {
  search: string;
  assignee: string;
  due: string;
  onSearch: (value: string) => void;
  onAssignee: (value: string) => void;
  onDue: (value: string) => void;
  people: BoardData['people'];
  filtered: boolean;
  activeFilterCount: number;
  onToggleArchive: () => void;
}) {
  const { t } = useI18n();
  const [filtersOpen, setFiltersOpen] = useState(false);
  return (
    <div className="surface motion-reveal motion-delay-1 mb-4 flex flex-wrap items-end gap-3 p-4">
      <label className="field min-w-[min(100%,12rem)] flex-1">
        {t('Search cards')}
        <input
          type="search"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
        />
      </label>
      <button
        type="button"
        className="button secondary sm:hidden"
        aria-expanded={filtersOpen}
        aria-controls="board-filters"
        onClick={() => setFiltersOpen((value) => !value)}
      >
        {t('Filters')}{' '}
        {activeFilterCount > 0 && <span>({activeFilterCount})</span>}
      </button>
      <div
        id="board-filters"
        className={`${filtersOpen ? 'flex' : 'hidden'} w-full flex-wrap items-end gap-3 sm:flex sm:w-auto`}
      >
        <label className="field">
          {t('Filter by assignee')}
          <select value={assignee} onChange={(e) => onAssignee(e.target.value)}>
            <option value="">{t('All members')}</option>
            <option value="unassigned">{t('Unassigned')}</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          {t('Filter by due date')}
          <select value={due} onChange={(e) => onDue(e.target.value)}>
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
            onSearch('');
            onAssignee('');
            onDue('');
          }}
        >
          {t('Clear filters')}
        </button>
      </div>
      <button className="button secondary" onClick={onToggleArchive}>
        {t('Archived cards')}
      </button>
      {filtered && (
        <p className="w-full text-xs text-muted">
          {t('{count} active filter(s).', { count: activeFilterCount })}{' '}
          {t('Clear filters to drag cards. Editing remains available.')}
        </p>
      )}
    </div>
  );
}
