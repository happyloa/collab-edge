'use client';
import { useState, useRef, useEffect } from 'react';
import { X } from 'lucide-react';
import { useI18n } from '../ui/i18n';
import { ApiErrorNotice } from '../ui/api-error-notice';
import { ApiError } from '../../src/lib/api-client';
import { Attachments } from './attachments';
import type { Snapshot, Command } from '../../src/realtime/protocol';
import { restoreCardDraft } from '../../src/drafts/restore';
import {
  saveDraft,
  removeDraft,
  type CardDraft,
  type DraftLease,
  type DraftFields,
  draftErrorMessage,
} from '../../src/drafts/store';
type Card = Snapshot['cards'][number];
type People = { id: string; name: string }[];
export function CardDialog({
  initial,
  state,
  readOnly,
  mutate,
  close,
  people,
  reconnect,
  connectionStatus,
  connectionError,
  ownerId,
  draftLease,
  restoredDraft,
}: {
  initial: Card;
  state: Snapshot;
  readOnly: boolean;
  mutate: (command: Command, base?: number) => Promise<boolean>;
  close: () => void;
  people: People;
  reconnect: () => void;
  connectionStatus: string;
  connectionError: string;
  ownerId: string;
  draftLease: DraftLease | null;
  restoredDraft?: CardDraft | null;
}) {
  const { t, locale } = useI18n();

  const dialog = useRef<HTMLDialogElement>(null);
  const [restored] = useState(() => {
    const current: DraftFields = {
      title: initial.title,
      description: initial.description,
      assigneeId: initial.assigneeId,
      dueDate: initial.dueDate,
    };
    return restoredDraft
      ? restoreCardDraft(restoredDraft, current)
      : { original: current, fields: current };
  });
  const original = restored.original;
  const [draftId] = useState(() => restoredDraft?.id ?? crypto.randomUUID());
  const [title, setTitle] = useState(restored.fields.title);
  const [description, setDescription] = useState(restored.fields.description);
  const [assigneeId, setAssigneeId] = useState(
    restored.fields.assigneeId ?? '',
  );
  const [dueDate, setDueDate] = useState(restored.fields.dueDate ?? '');
  const [comment, setComment] = useState(restoredDraft?.comment ?? '');
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [base] = useState(restoredDraft?.baseRevision ?? state.board.revision);
  const [busy, setBusy] = useState(false);
  const [saveStatus, setSaveStatus] = useState(
    restoredDraft ? 'Draft saved on this device.' : '',
  );
  const writes = useRef(Promise.resolve());
  const nextDraft = useRef<CardDraft | 'remove' | null>(null);
  const writing = useRef(false);
  const dirty =
    title !== original.title ||
    description !== original.description ||
    (assigneeId || null) !== original.assigneeId ||
    (dueDate || null) !== (original.dueDate || null) ||
    comment !== '';
  useEffect(() => {
    if (readOnly) return;
    if (!draftLease) return;
    const draft: CardDraft = {
      kind: 'card',
      version: 1,
      id: draftId,
      ownerId,
      boardId: state.board.id,
      cardId: initial.id,
      baseRevision: base,
      original,
      fields: {
        title,
        description,
        assigneeId: assigneeId || null,
        dueDate: dueDate || null,
      },
      comment,
      updatedAt: Date.now(),
    };
    setSaveStatus('Saving draft on this device…');
    nextDraft.current = dirty ? draft : 'remove';
    if (writing.current) return;
    writing.current = true;
    const next = writes.current
      .catch(() => {})
      .then(async () => {
        try {
          while (nextDraft.current) {
            const latest = nextDraft.current;
            nextDraft.current = null;
            if (latest === 'remove') await removeDraft(draftLease, draftId);
            else await saveDraft(draftLease, latest);
          }
        } finally {
          writing.current = false;
        }
      });
    writes.current = next;
    void next
      .then(() => {
        if (!nextDraft.current) setSaveStatus('Draft saved on this device.');
      })
      .catch((error) => {
        setSaveStatus(draftErrorMessage(error));
      });
  }, [
    title,
    description,
    assigneeId,
    dueDate,
    comment,
    dirty,
    readOnly,
    draftLease,
    draftId,
    ownerId,
    state.board.id,
    initial.id,
    base,
    original,
  ]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (dirty && saveStatus !== 'Draft saved on this device.')
        event.preventDefault();
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty, saveStatus]);
  useEffect(() => {
    const previousFocus = document.activeElement;
    dialog.current?.showModal();
    return () => {
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected)
        previousFocus.focus();
      else document.querySelector<HTMLElement>('[data-board-heading]')?.focus();
    };
  }, []);
  function requestClose() {
    if (busy) return;
    if (dirty) setConfirmClose(true);
    else close();
  }
  async function discardAndClose() {
    setBusy(true);
    try {
      await writes.current.catch(() => {});
      if (draftLease) await removeDraft(draftLease, draftId);
      close();
    } catch (error) {
      setSaveStatus(draftErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function keepAndClose() {
    setBusy(true);
    try {
      if (!draftLease) throw new Error('Storage unavailable');
      await writes.current;
      close();
    } catch (error) {
      setSaveStatus(draftErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      onClose={requestClose}
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
      aria-labelledby="card-dialog-title"
      className="motion-dialog m-auto max-h-11/12 w-full max-w-xl overflow-y-auto rounded-2xl border border-border bg-surface p-7 text-foreground shadow-panel backdrop:bg-black/40"
    >
      <div className="mb-6 flex items-center justify-between">
        <h2 id="card-dialog-title" className="eyebrow">
          {t('CARD DETAILS')}
        </h2>
        <button
          className="icon-button"
          aria-label={t('Close card')}
          onClick={requestClose}
          disabled={busy}
        >
          <X size={20} />
        </button>
      </div>
      {dirty && (
        <p
          role="status"
          aria-label={t('Draft status')}
          className="notice mb-4 text-sm"
        >
          {t(
            saveStatus ||
              'Draft storage is unavailable. Keep this tab open or copy your edits.',
          )}
        </p>
      )}
      {confirmClose && (
        <div role="alert" className="notice mb-4 space-y-3">
          <p>{t('Keep your edits on this device before closing?')}</p>
          <div className="flex flex-wrap gap-3">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => void keepAndClose()}
            >
              {t('Keep draft and close')}
            </button>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => void discardAndClose()}
            >
              {t('Discard and close')}
            </button>
            <button disabled={busy} onClick={() => setConfirmClose(false)}>
              {t('Continue editing')}
            </button>
          </div>
        </div>
      )}
      {connectionStatus === 'Access expired' && (
        <ApiErrorNotice
          error={new ApiError(connectionError, 401, 'UNAUTHENTICATED')}
          className="mb-4"
        />
      )}
      <div className="mb-4 flex justify-end">
        <button
          type="button"
          className="button secondary"
          onClick={reconnect}
          disabled={
            connectionStatus === 'Connecting' || connectionStatus === 'Syncing'
          }
        >
          {t('Reconnect board')}
        </button>
      </div>
      <form
        className="space-y-5"
        onSubmit={async (e) => {
          e.preventDefault();
          const payload: {
            id: string;
            title?: string;
            description?: string;
            assigneeId?: string | null;
            dueDate?: string | null;
          } = { id: initial.id };
          if (title !== original.title) payload.title = title;
          if (description !== original.description)
            payload.description = description;
          if ((assigneeId || null) !== original.assigneeId)
            payload.assigneeId = assigneeId || null;
          if ((dueDate || null) !== (original.dueDate || null))
            payload.dueDate = dueDate || null;
          if (Object.keys(payload).length === 1) return;
          if (busy) return;
          setBusy(true);
          try {
            if (await mutate({ type: 'card.update', payload }, base)) {
              // The socket queue is durable before clearing the form draft.
              await writes.current;
              if (comment === '') {
                if (draftLease) await removeDraft(draftLease, draftId);
                close();
              } else {
                if (draftLease)
                  await saveDraft(draftLease, {
                    kind: 'card',
                    version: 1,
                    id: draftId,
                    ownerId,
                    boardId: state.board.id,
                    cardId: initial.id,
                    baseRevision: base,
                    original: {
                      title,
                      description,
                      assigneeId: assigneeId || null,
                      dueDate: dueDate || null,
                    },
                    fields: {
                      title,
                      description,
                      assigneeId: assigneeId || null,
                      dueDate: dueDate || null,
                    },
                    comment,
                    updatedAt: Date.now(),
                  });
                close();
              }
            }
          } catch (error) {
            setSaveStatus(draftErrorMessage(error));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="field">
          {t('Title')}
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={160}
            readOnly={readOnly}
            disabled={busy}
          />
        </label>
        <label className="field">
          {t('Description')}
          <textarea
            aria-label={t('Description')}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={10000}
            readOnly={readOnly}
            disabled={busy}
          />
        </label>
        <label className="field">
          {t('Assignee')}
          <select
            aria-label={t('Assignee')}
            disabled={readOnly || busy}
            value={assigneeId}
            onChange={(e) => setAssigneeId(e.target.value)}
          >
            <option value="">{t('Unassigned')}</option>
            {assigneeId && !people.some((p) => p.id === assigneeId) && (
              <option value={assigneeId}>{t('Former member')}</option>
            )}
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          {t('Due date')}
          <input
            type="date"
            readOnly={readOnly}
            disabled={busy}
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </label>
        {!readOnly && (
          <div className="flex flex-wrap justify-between gap-3">
            <button className="button" disabled={busy}>
              {t('Save changes')}
            </button>
            <button
              type="button"
              className="text-sm text-destructive"
              disabled={busy}
              onClick={async () => {
                if (!confirmArchive) {
                  setConfirmArchive(true);
                  return;
                }
                if (
                  await mutate(
                    { type: 'card.archive', payload: { id: initial.id } },
                    base,
                  )
                )
                  await discardAndClose();
              }}
            >
              {t(confirmArchive ? 'Confirm archive card' : 'Archive card')}
            </button>
            {confirmArchive && (
              <button type="button" onClick={() => setConfirmArchive(false)}>
                {t('Cancel')}
              </button>
            )}
          </div>
        )}
      </form>
      {!readOnly && (
        <label className="field mt-6">
          {t('Move to')}
          <select
            value={
              state.cards.find((c) => c.id === initial.id)?.columnId ??
              initial.columnId
            }
            onChange={(e) =>
              mutate({
                type: 'card.move',
                payload: {
                  id: initial.id,
                  columnId: e.target.value,
                  beforeId: null,
                },
              })
            }
          >
            {state.columns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </label>
      )}
      <section className="mt-8 border-t border-border pt-6">
        <h2 className="font-semibold">{t('Conversation')}</h2>
        <ul className="my-4 space-y-3">
          {state.comments
            .filter((c) => c.cardId === initial.id)
            .map((c) => (
              <li key={c.id} className="rounded-lg bg-background p-3 text-sm">
                <p className="whitespace-pre-wrap">{c.body}</p>
                <time className="mt-2 block text-xs text-muted">
                  {new Date(c.createdAt).toLocaleString(locale)}
                </time>
              </li>
            ))}
        </ul>
        {readOnly && comment && (
          <label className="field">
            {t('Unsent comment')}
            <textarea
              aria-label={t('Unsent comment')}
              value={comment}
              readOnly
            />
          </label>
        )}
        {!readOnly && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (busy) return;
              setBusy(true);
              if (
                await mutate({
                  type: 'comment.create',
                  payload: {
                    id: crypto.randomUUID(),
                    cardId: initial.id,
                    body: comment,
                  },
                })
              )
                setComment('');
              setBusy(false);
            }}
          >
            <label className="field">
              {t('Add a comment')}
              <textarea
                aria-label={t('Add a comment')}
                name="body"
                required
                maxLength={2000}
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                disabled={busy}
              />
            </label>
            <button className="button secondary mt-3" disabled={busy}>
              {t('Post comment')}
            </button>
          </form>
        )}
      </section>
      <Attachments
        cardId={initial.id}
        items={state.attachments}
        readOnly={readOnly}
      />
    </dialog>
  );
}
