'use client';
import { useState } from 'react';
import { Archive, Search, SlidersHorizontal } from 'lucide-react';
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
  archiveOpen,
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
  archiveOpen: boolean;
  onToggleArchive: () => void;
}) {
  const { t } = useI18n();
  const [filtersOpen, setFiltersOpen] = useState(false);
  return (
    <div className="mb-5 flex flex-wrap items-center gap-2">
      <label className="relative min-w-[min(100%,12rem)] flex-1 sm:max-w-xs">
        <span className="sr-only">{t('Search cards')}</span>
        <Search
          size={15}
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted"
        />
        <input
          type="search"
          className="pl-9"
          placeholder={t('Search cards')}
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
        <SlidersHorizontal size={15} aria-hidden="true" />
        {t('Filters')}{' '}
        {activeFilterCount > 0 && <span>({activeFilterCount})</span>}
      </button>
      <div
        id="board-filters"
        className={`${filtersOpen ? 'flex' : 'hidden'} w-full flex-wrap items-center gap-2 sm:flex sm:w-auto`}
      >
        <label>
          <span className="sr-only">{t('Filter by assignee')}</span>
          <select
            className="w-auto"
            value={assignee}
            onChange={(e) => onAssignee(e.target.value)}
          >
            <option value="">{t('All members')}</option>
            <option value="unassigned">{t('Unassigned')}</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">{t('Filter by due date')}</span>
          <select
            className="w-auto"
            value={due}
            onChange={(e) => onDue(e.target.value)}
          >
            <option value="">{t('All dates')}</option>
            <option value="overdue">{t('Overdue')}</option>
            <option value="today">{t('Due today')}</option>
            <option value="upcoming">{t('Upcoming')}</option>
            <option value="none">{t('No due date')}</option>
          </select>
        </label>
        {filtered && (
          <button
            className="button ghost"
            onClick={() => {
              onSearch('');
              onAssignee('');
              onDue('');
            }}
          >
            {t('Clear filters')}
          </button>
        )}
      </div>
      <button
        className="button ghost sm:ml-auto"
        aria-pressed={archiveOpen}
        onClick={onToggleArchive}
      >
        <Archive size={15} aria-hidden="true" />
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
