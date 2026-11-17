'use client';
import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../ui/i18n';
import type { Snapshot, Command } from '../../src/realtime/protocol';
import type { CardDraft } from '../../src/drafts/store';

type Comment = Snapshot['comments'][number];
export type CommentEdit = NonNullable<CardDraft['commentEdit']>;

/**
 * A card's comments. Authors can edit and delete their own; a workspace owner
 * can delete anyone's. The open edit lives in the card dialog so it is saved
 * with the card draft and guards closing like any other unsent field.
 */
export function CommentList({
  comments,
  userId,
  canModerate,
  readOnly,
  busy,
  revision,
  edit,
  onEdit,
  submit,
}: {
  comments: Comment[];
  userId: string;
  canModerate: boolean;
  readOnly: boolean;
  busy: boolean;
  revision: number;
  edit: CommentEdit | null;
  onEdit: (edit: CommentEdit | null) => void;
  submit: (command: Command, base?: number) => Promise<boolean>;
}) {
  const { t, locale } = useI18n();
  const list = useRef<HTMLUListElement>(null);
  const editor = useRef<HTMLTextAreaElement>(null);
  const returnTo = useRef<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const canEdit = (comment: Comment) =>
    !readOnly && comment.actorId === userId && !comment.importedAuthorName;
  const canDelete = (comment: Comment) =>
    !readOnly && (comment.actorId === userId || canModerate);
  const target = edit && comments.find((comment) => comment.id === edit.id);
  const editingId = target && canEdit(target) ? target.id : null;
  useEffect(() => {
    if (editingId) editor.current?.focus();
    else if (returnTo.current) {
      list.current
        ?.querySelector<HTMLElement>(
          `[data-comment-edit="${returnTo.current}"]`,
        )
        ?.focus();
      returnTo.current = null;
    }
  }, [editingId]);
  function stopEditing(id: string) {
    returnTo.current = id;
    onEdit(null);
  }
  return (
    <>
      <ul ref={list} className="my-4 space-y-3">
        {comments.map((comment) => (
          <li key={comment.id} className="rounded-lg bg-background p-3 text-sm">
            {edit && editingId === comment.id ? (
              <form
                onSubmit={async (event) => {
                  event.preventDefault();
                  const body = edit.body.trim();
                  if (!body) return;
                  if (
                    body === comment.body ||
                    (await submit(
                      {
                        type: 'comment.update',
                        payload: { id: comment.id, body },
                      },
                      edit.baseRevision,
                    ))
                  )
                    stopEditing(comment.id);
                }}
              >
                <label className="field">
                  {t('Edit comment')}
                  <textarea
                    ref={editor}
                    aria-label={t('Edit comment')}
                    required
                    maxLength={2000}
                    value={edit.body}
                    onChange={(event) =>
                      onEdit({ ...edit, body: event.target.value })
                    }
                    disabled={busy}
                  />
                </label>
                <div className="mt-3 flex flex-wrap items-center gap-4">
                  <button className="button secondary" disabled={busy}>
                    {t('Save comment')}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => stopEditing(comment.id)}
                  >
                    {t('Cancel')}
                  </button>
                </div>
              </form>
            ) : (
              <p className="whitespace-pre-wrap">{comment.body}</p>
            )}
            {comment.importedAuthorName && (
              <p className="mt-2 text-xs text-muted">
                {t('Imported author: {name} (unverified)', {
                  name: comment.importedAuthorName,
                })}
              </p>
            )}
            <p className="mt-2 text-xs text-muted">
              <time>{new Date(comment.createdAt).toLocaleString(locale)}</time>
              {comment.editedAt && (
                <>
                  {' · '}
                  <span
                    title={new Date(comment.editedAt).toLocaleString(locale)}
                  >
                    {t('Edited')}
                  </span>
                </>
              )}
            </p>
            {editingId !== comment.id &&
              (canEdit(comment) || canDelete(comment)) && (
                <div className="mt-2 flex flex-wrap items-center gap-4 text-xs">
                  {canEdit(comment) && confirmDelete !== comment.id && (
                    <button
                      type="button"
                      data-comment-edit={comment.id}
                      className="text-primary underline underline-offset-4"
                      disabled={busy}
                      onClick={() =>
                        onEdit({
                          id: comment.id,
                          body: comment.body,
                          baseRevision: revision,
                        })
                      }
                    >
                      {t('Edit comment')}
                    </button>
                  )}
                  {canDelete(comment) && (
                    <button
                      type="button"
                      className="text-destructive"
                      disabled={busy}
                      onClick={async () => {
                        if (confirmDelete !== comment.id) {
                          setConfirmDelete(comment.id);
                          return;
                        }
                        if (
                          await submit({
                            type: 'comment.remove',
                            payload: { id: comment.id },
                          })
                        ) {
                          setConfirmDelete(null);
                          // The comment leaves the list; keep focus in the dialog.
                          list.current
                            ?.closest('section')
                            ?.querySelector<HTMLElement>(
                              '[data-conversation-heading]',
                            )
                            ?.focus();
                        }
                      }}
                    >
                      {t(
                        confirmDelete === comment.id
                          ? 'Confirm delete comment'
                          : 'Delete comment',
                      )}
                    </button>
                  )}
                  {confirmDelete === comment.id && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setConfirmDelete(null)}
                    >
                      {t('Cancel')}
                    </button>
                  )}
                </div>
              )}
          </li>
        ))}
      </ul>
      {edit && !editingId && (
        <div className="notice attention mb-4 space-y-3 text-sm">
          <p>
            {t(
              'This comment can no longer be edited. Your text is kept here so you can copy it.',
            )}
          </p>
          <label className="field">
            {t('Unsent comment edit')}
            <textarea
              aria-label={t('Unsent comment edit')}
              value={edit.body}
              readOnly
            />
          </label>
          <button type="button" disabled={busy} onClick={() => onEdit(null)}>
            {t('Discard draft')}
          </button>
        </div>
      )}
    </>
  );
}
