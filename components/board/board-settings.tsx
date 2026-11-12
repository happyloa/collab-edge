'use client';
import { useState } from 'react';
import { useI18n } from '../ui/i18n';
import type { Snapshot, Command } from '../../src/realtime/protocol';

export function BoardSettings({
  initial,
  mutate,
  close,
}: {
  initial: Snapshot['board'];
  mutate: (command: Command, base?: number) => Promise<boolean>;
  close: () => void;
}) {
  const { t } = useI18n();

  const [title, setTitle] = useState(initial.name);
  const [confirmArchive, setConfirmArchive] = useState(false);
  return (
    <section
      className="surface motion-reveal mb-4 space-y-4 p-5"
      aria-label={t('Board settings')}
    >
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={async (event) => {
          event.preventDefault();
          if (
            await mutate(
              { type: 'board.rename', payload: { id: initial.id, title } },
              initial.revision,
            )
          )
            close();
        }}
      >
        <label className="field">
          {t('Board name')}
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
            maxLength={160}
          />
        </label>
        <button className="button">{t('Save board name')}</button>
        <button type="button" className="button secondary" onClick={close}>
          {t('Cancel')}
        </button>
      </form>
      {confirmArchive ? (
        <div className="space-y-3">
          <p>
            {t(
              'Archive this board? It will become read-only and disappear from the workspace list. History is retained and still counts toward usage limits.',
            )}
          </p>
          <button
            className="button secondary"
            onClick={async () => {
              if (
                await mutate(
                  { type: 'board.archive', payload: { id: initial.id } },
                  initial.revision,
                )
              )
                close();
            }}
          >
            {t('Confirm archive board')}
          </button>
        </div>
      ) : (
        <button
          className="text-sm text-destructive"
          onClick={() => setConfirmArchive(true)}
        >
          {t('Archive board')}
        </button>
      )}
    </section>
  );
}
