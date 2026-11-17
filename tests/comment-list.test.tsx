import '@testing-library/jest-dom/vitest';
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import {
  CommentList,
  type CommentEdit,
} from '../components/board/comment-list';
import type { Command, Snapshot } from '../src/realtime/protocol';

afterEach(cleanup);

const mine: Snapshot['comments'][number] = {
  id: 'mine',
  cardId: 'card',
  boardId: 'board',
  actorId: 'alice',
  body: 'My note',
  createdAt: '2026-11-01T00:00:00Z',
};
const theirs = { ...mine, id: 'theirs', actorId: 'bob', body: 'Bob note' };
const imported = {
  ...mine,
  id: 'imported',
  body: 'Old note',
  importedAuthorName: 'Carol',
};

function Harness({
  comments = [mine, theirs],
  canModerate = false,
  readOnly = false,
  initialEdit = null,
  submit,
}: {
  comments?: Snapshot['comments'];
  canModerate?: boolean;
  readOnly?: boolean;
  initialEdit?: CommentEdit | null;
  submit: (command: Command, base?: number) => Promise<boolean>;
}) {
  const [edit, setEdit] = useState<CommentEdit | null>(initialEdit);
  return (
    <section>
      <h2 tabIndex={-1} data-conversation-heading>
        Conversation
      </h2>
      <CommentList
        comments={comments}
        userId="alice"
        canModerate={canModerate}
        readOnly={readOnly}
        busy={false}
        revision={7}
        edit={edit}
        onEdit={setEdit}
        submit={submit}
      />
    </section>
  );
}

it('offers editing only on the reader’s own comments and submits from the revision the edit began at', async () => {
  const submit = vi.fn().mockResolvedValue(true);
  render(<Harness submit={submit} />);
  // Bob's comment has no controls for Alice.
  expect(screen.getAllByRole('button', { name: 'Edit comment' })).toHaveLength(
    1,
  );
  expect(
    screen.getAllByRole('button', { name: 'Delete comment' }),
  ).toHaveLength(1);

  fireEvent.click(screen.getByRole('button', { name: 'Edit comment' }));
  const editor = screen.getByRole('textbox', { name: 'Edit comment' });
  expect(editor).toHaveFocus();
  expect(editor).toHaveValue('My note');
  fireEvent.change(editor, { target: { value: '  My better note ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save comment' }));

  await screen.findByRole('button', { name: 'Edit comment' });
  expect(submit).toHaveBeenCalledWith(
    { type: 'comment.update', payload: { id: 'mine', body: 'My better note' } },
    7,
  );
  expect(screen.getByRole('button', { name: 'Edit comment' })).toHaveFocus();
});

it('keeps the edit open when the change could not be queued and skips unchanged text', async () => {
  const submit = vi.fn().mockResolvedValue(false);
  render(<Harness submit={submit} />);
  fireEvent.click(screen.getByRole('button', { name: 'Edit comment' }));
  const editor = screen.getByRole('textbox', { name: 'Edit comment' });
  fireEvent.change(editor, { target: { value: 'Unsaved words' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save comment' }));
  await vi.waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
  expect(screen.getByRole('textbox', { name: 'Edit comment' })).toHaveValue(
    'Unsaved words',
  );

  // Saving the original text closes the editor without a mutation.
  fireEvent.change(editor, { target: { value: 'My note' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save comment' }));
  await screen.findByRole('button', { name: 'Edit comment' });
  expect(submit).toHaveBeenCalledTimes(1);
});

it('asks before deleting and lets a workspace owner delete others’ comments', async () => {
  const submit = vi.fn().mockResolvedValue(true);
  render(<Harness submit={submit} canModerate />);
  const buttons = screen.getAllByRole('button', { name: 'Delete comment' });
  expect(buttons).toHaveLength(2);
  // Moderation never includes rewriting.
  expect(screen.getAllByRole('button', { name: 'Edit comment' })).toHaveLength(
    1,
  );

  fireEvent.click(buttons[1]);
  expect(submit).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(
    screen.queryByRole('button', { name: 'Confirm delete comment' }),
  ).not.toBeInTheDocument();

  fireEvent.click(screen.getAllByRole('button', { name: 'Delete comment' })[1]);
  fireEvent.click(
    screen.getByRole('button', { name: 'Confirm delete comment' }),
  );
  await vi.waitFor(() =>
    expect(submit).toHaveBeenCalledWith({
      type: 'comment.remove',
      payload: { id: 'theirs' },
    }),
  );
  await vi.waitFor(() =>
    expect(screen.getByRole('heading', { name: 'Conversation' })).toHaveFocus(),
  );
});

it('shows edited and imported comments without edit controls where they do not apply', () => {
  render(
    <Harness
      submit={vi.fn()}
      comments={[{ ...mine, editedAt: '2026-11-02T00:00:00Z' }, imported]}
    />,
  );
  expect(screen.getByText('Edited')).toBeInTheDocument();
  // The imported comment can be deleted by its importer but not rewritten.
  expect(screen.getAllByRole('button', { name: 'Edit comment' })).toHaveLength(
    1,
  );
  expect(
    screen.getAllByRole('button', { name: 'Delete comment' }),
  ).toHaveLength(2);
  cleanup();
  render(<Harness submit={vi.fn()} readOnly />);
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

it('keeps unsent text visible when the comment being edited is gone', () => {
  render(
    <Harness
      submit={vi.fn()}
      comments={[theirs]}
      initialEdit={{ id: 'mine', body: 'Half-written', baseRevision: 5 }}
    />,
  );
  expect(
    screen.getByRole('textbox', { name: 'Unsent comment edit' }),
  ).toHaveValue('Half-written');
  fireEvent.click(screen.getByRole('button', { name: 'Discard draft' }));
  expect(
    screen.queryByRole('textbox', { name: 'Unsent comment edit' }),
  ).not.toBeInTheDocument();
});
