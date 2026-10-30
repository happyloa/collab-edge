'use client';
import {
  useState,
  useRef,
  useEffect,
  useId,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { X } from 'lucide-react';
import { useI18n } from '../ui/i18n';
import { ApiErrorNotice } from '../ui/api-error-notice';
import { ApiError } from '../../src/lib/api-client';
import { Attachments } from './attachments';
import { cardFieldStatus, type CardField } from './card-field-status';
import type { Pending } from '../../src/realtime/socket-client';
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
  attention,
  attachmentsEnabled,
  pending,
  moveCard,
  moveMessage,
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
  attention?: ReactNode;
  attachmentsEnabled: boolean;
  pending: Pending[];
  moveCard: (
    command: Extract<Command, { type: 'card.move' }>,
  ) => Promise<boolean>;
  moveMessage: string;
}) {
  const { t, locale } = useI18n();

  const dialog = useRef<HTMLDialogElement>(null);
  const closeGuard = useRef<HTMLDivElement>(null);
  const editFormId = useId();
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
  const [submittingFields, setSubmittingFields] = useState(false);
  const [beforeId, setBeforeId] = useState('');
  const [positionOpen, setPositionOpen] = useState(false);
  const movePending = useRef(false);
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
  const currentCard =
    state.cards.find((card) => card.id === initial.id) ?? initial;
  const fieldStatusId = (field: CardField) => `${editFormId}-${field}-status`;
  function fieldStatus(field: CardField, value: string | null) {
    return (
      <span
        id={fieldStatusId(field)}
        className="block text-xs font-normal text-muted"
      >
        {t(
          cardFieldStatus({
            field,
            value,
            original: original[field],
            current: currentCard,
            pending,
            busy: submittingFields,
            saveStatus,
          }),
        )}
      </span>
    );
  }
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
    dialog.current
      ?.querySelector<HTMLButtonElement>('[data-card-dialog-close]')
      ?.focus();
    return () => {
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected)
        previousFocus.focus();
      else document.querySelector<HTMLElement>('[data-board-heading]')?.focus();
    };
  }, []);
  useEffect(() => {
    if (confirmClose) closeGuard.current?.focus();
  }, [confirmClose]);
  function requestClose() {
    if (busy) return;
    if (dirty) setConfirmClose(true);
    else close();
  }
  function containTabFocus(event: KeyboardEvent<HTMLDialogElement>) {
    if (
      event.key !== 'Tab' ||
      event.defaultPrevented ||
      event.ctrlKey ||
      event.altKey ||
      event.metaKey
    )
      return;
    const controls = [
      ...event.currentTarget.querySelectorAll<HTMLElement>(
        'a[href], button, input, select, textarea, [tabindex]',
      ),
    ].filter(
      (element) =>
        element.tabIndex >= 0 &&
        !element.matches(':disabled') &&
        !element.closest('[inert]') &&
        element.getClientRects().length > 0 &&
        getComputedStyle(element).visibility !== 'hidden',
    );
    const destination = event.shiftKey ? controls.at(-1) : controls[0];
    const boundary = event.shiftKey ? controls[0] : controls.at(-1);
    // Native modal inertness protects the page, but Chromium can otherwise
    // leave the document after the last control. Wrap only at the boundary;
    // keep native keyboard navigation within date/select/file controls.
    if (destination && document.activeElement === boundary) {
      event.preventDefault();
      destination.focus();
    }
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
      onKeyDown={containTabFocus}
      onClose={requestClose}
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
      aria-labelledby="card-dialog-title"
      className="motion-dialog card-detail-dialog m-auto max-h-[calc(100dvh_-_1rem)] w-[calc(100%_-_1rem)] max-w-xl overflow-hidden rounded-2xl border border-border bg-surface p-0 text-foreground shadow-float backdrop:bg-black/40 open:flex open:flex-col lg:max-w-4xl"
    >
      <div
        className="card-detail-content min-h-0 overflow-auto p-5 sm:p-7"
        onFocusCapture={(event) => {
          const field = event.target;
          if (!field.matches('input, select, textarea')) return;
          const content = event.currentTarget;
          // Native date inputs may scroll their inner editor after focus.
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              if (document.activeElement !== field || !field.isConnected)
                return;
              const bounds = field.getBoundingClientRect();
              const viewport = content.getBoundingClientRect();
              if (
                bounds.top < viewport.top + 12 ||
                bounds.bottom > viewport.bottom - 12
              )
                field.scrollIntoView({
                  block: 'center',
                  inline: 'nearest',
                  behavior: 'instant',
                });
            }),
          );
        }}
      >
        <div className="mb-6 flex items-center justify-between border-b border-border pb-4">
          <h2 id="card-dialog-title" className="eyebrow">
            {t('CARD DETAILS')}
          </h2>
          <button
            className="icon-button"
            data-card-dialog-close
            aria-label={t('Close card')}
            onClick={requestClose}
            disabled={busy}
          >
            <X size={20} />
          </button>
        </div>
        {attention}
        {dirty && (
          <p
            role="status"
            aria-label={t('Draft status')}
            className="notice attention mb-4 text-sm"
          >
            {t(
              saveStatus ||
                'Draft storage is unavailable. Keep this tab open or copy your edits.',
            )}
          </p>
        )}
        {confirmClose && (
          <div
            ref={closeGuard}
            role="alert"
            tabIndex={-1}
            className="notice attention mb-4 space-y-3"
          >
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
        {(connectionError || connectionStatus === 'Access expired') && (
          <ApiErrorNotice
            error={
              connectionStatus === 'Access expired'
                ? new ApiError(connectionError, 401, 'UNAUTHENTICATED')
                : connectionError
            }
            className="mb-4"
          />
        )}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <span className="badge">{t(connectionStatus)}</span>
          <button
            type="button"
            className="button secondary"
            onClick={reconnect}
            disabled={
              connectionStatus === 'Connecting' ||
              connectionStatus === 'Syncing'
            }
          >
            {t('Reconnect board')}
          </button>
        </div>
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <div className="min-w-0">
            <form
              id={editFormId}
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
                setSubmittingFields(true);
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
                  setSubmittingFields(false);
                  setBusy(false);
                }
              }}
            >
              <label className="field">
                {t('Title')}
                <input
                  aria-label={t('Title')}
                  aria-describedby={fieldStatusId('title')}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  maxLength={160}
                  readOnly={readOnly}
                  disabled={busy}
                />
                {fieldStatus('title', title)}
              </label>
              <label className="field">
                {t('Description')}
                <textarea
                  aria-label={t('Description')}
                  aria-describedby={fieldStatusId('description')}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={10000}
                  readOnly={readOnly}
                  disabled={busy}
                />
                {fieldStatus('description', description)}
              </label>
              <label className="field">
                {t('Assignee')}
                <select
                  aria-label={t('Assignee')}
                  aria-describedby={fieldStatusId('assigneeId')}
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
                {fieldStatus('assigneeId', assigneeId || null)}
              </label>
              <label className="field">
                {t('Due date')}
                <input
                  type="date"
                  aria-label={t('Due date')}
                  aria-describedby={fieldStatusId('dueDate')}
                  readOnly={readOnly}
                  disabled={busy}
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
                {fieldStatus('dueDate', dueDate || null)}
              </label>
              {!readOnly && (
                <div className="flex flex-wrap justify-between gap-3">
                  <button className="button card-desktop-save" disabled={busy}>
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
                    {t(
                      confirmArchive ? 'Confirm archive card' : 'Archive card',
                    )}
                  </button>
                  {confirmArchive && (
                    <button
                      type="button"
                      onClick={() => setConfirmArchive(false)}
                    >
                      {t('Cancel')}
                    </button>
                  )}
                </div>
              )}
            </form>
            {!readOnly && (
              <section
                className="mt-8 space-y-4 border-t border-border pt-6"
                aria-label={t('Move without dragging')}
              >
                <h2 className="font-semibold">{t('Move without dragging')}</h2>
                <label className="field">
                  {t('Move to')}
                  <select
                    value={
                      state.cards.find((c) => c.id === initial.id)?.columnId ??
                      initial.columnId
                    }
                    disabled={busy}
                    onChange={(e) => {
                      setBeforeId('');
                      void moveCard({
                        type: 'card.move',
                        payload: {
                          id: initial.id,
                          columnId: e.target.value,
                          beforeId: null,
                        },
                      });
                    }}
                  >
                    {state.columns.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="text-sm text-primary underline underline-offset-4"
                  aria-expanded={positionOpen}
                  onClick={() => setPositionOpen((value) => !value)}
                >
                  {t('Choose position in column')}
                </button>
                {positionOpen && (
                  <form
                    onSubmit={async (event) => {
                      event.preventDefault();
                      if (busy || movePending.current) return;
                      const columnId =
                        state.cards.find((card) => card.id === initial.id)
                          ?.columnId ?? initial.columnId;
                      movePending.current = true;
                      setBusy(true);
                      try {
                        await moveCard({
                          type: 'card.move',
                          payload: {
                            id: initial.id,
                            columnId,
                            beforeId: beforeId || null,
                          },
                        });
                      } finally {
                        movePending.current = false;
                        setBusy(false);
                      }
                    }}
                    className="space-y-3"
                  >
                    <label className="field">
                      {t('Position')}
                      <select
                        value={beforeId}
                        onChange={(event) => setBeforeId(event.target.value)}
                        disabled={busy}
                      >
                        <option value="">{t('End of column')}</option>
                        {state.cards
                          .filter(
                            (card) =>
                              !card.archived &&
                              card.id !== initial.id &&
                              card.columnId ===
                                (state.cards.find(
                                  (item) => item.id === initial.id,
                                )?.columnId ?? initial.columnId),
                          )
                          .sort((a, b) => a.position - b.position)
                          .map((card) => (
                            <option key={card.id} value={card.id}>
                              {t('Before {title}', { title: card.title })}
                            </option>
                          ))}
                      </select>
                    </label>
                    <button
                      className="button secondary"
                      type="submit"
                      disabled={busy}
                      aria-busy={busy}
                    >
                      {t('Move card')}
                    </button>
                  </form>
                )}
                <p
                  role="status"
                  aria-label={t('Card movement')}
                  className="text-sm text-muted"
                >
                  {moveMessage}
                </p>
              </section>
            )}
          </div>
          <div className="min-w-0 lg:border-l lg:border-border lg:pl-8">
            <section className="mt-8 border-t border-border pt-6 lg:mt-0 lg:border-t-0 lg:pt-0">
              <h2 className="font-semibold">{t('Conversation')}</h2>
              <ul className="my-4 space-y-3">
                {state.comments
                  .filter((c) => c.cardId === initial.id)
                  .map((c) => (
                    <li
                      key={c.id}
                      className="rounded-lg bg-background p-3 text-sm"
                    >
                      <p className="whitespace-pre-wrap">{c.body}</p>
                      {c.importedAuthorName && (
                        <p className="mt-2 text-xs text-muted">
                          {t('Imported author: {name} (unverified)', {
                            name: c.importedAuthorName,
                          })}
                        </p>
                      )}
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
              references={state.attachmentReferences}
              readOnly={readOnly}
              enabled={attachmentsEnabled}
            />
          </div>
        </div>
      </div>
      {!readOnly && (
        <div className="card-mobile-actions flex shrink-0 gap-3 border-t border-border bg-surface px-5 pt-3 sm:hidden">
          <button
            type="submit"
            form={editFormId}
            className="button"
            disabled={busy}
          >
            {t('Save changes')}
          </button>
          <button
            type="button"
            className="button secondary"
            onClick={requestClose}
            disabled={busy}
          >
            {t('Cancel')}
          </button>
        </div>
      )}
    </dialog>
  );
}
