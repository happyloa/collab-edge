import '@testing-library/jest-dom/vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { DeleteAccount } from '../components/workspace/delete-account';
import { api } from '../components/ui/providers';
import { ApiError } from '../src/lib/api-client';

vi.mock('../components/ui/providers', () => ({ api: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it('prevents duplicate deletion and preserves confirmation after a failed request', async () => {
  let reject!: (error: Error) => void;
  vi.mocked(api).mockImplementationOnce(
    () =>
      new Promise((_, fail) => {
        reject = fail;
      }),
  );
  render(<DeleteAccount ownsWorkspace={false} />);
  fireEvent.click(screen.getByRole('button', { name: 'Delete my account' }));
  const password = screen.getByLabelText('Confirm with your password');
  const confirmation = screen.getByLabelText(
    'I understand this cannot be undone.',
  );
  const submit = screen.getByRole('button', {
    name: 'Permanently delete account',
  });
  fireEvent.change(password, {
    target: { value: 'a synthetic test password' },
  });
  fireEvent.click(confirmation);
  const form = submit.closest('form')!;
  fireEvent.submit(form);
  fireEvent.submit(form);
  expect(api).toHaveBeenCalledTimes(1);
  expect(submit).toBeDisabled();
  expect(password).toBeDisabled();
  expect(
    screen.getByRole('button', { name: 'Delete my account' }),
  ).toBeDisabled();
  await act(async () =>
    reject(new ApiError('Incorrect password', 400, 'INVALID_CREDENTIALS')),
  );
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Incorrect password',
  );
  expect(password).toHaveValue('a synthetic test password');
  expect(confirmation).toBeChecked();
  expect(submit).toBeEnabled();
  vi.mocked(api).mockRejectedValueOnce(
    new ApiError('Please try again', 503, 'NETWORK_ERROR'),
  );
  fireEvent.submit(form);
  expect(api).toHaveBeenCalledTimes(2);
  await screen.findByText('Please try again');
  expect(submit).toBeEnabled();
});

it('requires transferring every owned workspace before displaying the deletion form', () => {
  render(<DeleteAccount ownsWorkspace />);
  fireEvent.click(screen.getByRole('button', { name: 'Delete my account' }));
  expect(
    screen.getByText('Transfer ownership of every workspace first.'),
  ).toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'Permanently delete account' }),
  ).not.toBeInTheDocument();
  expect(api).not.toHaveBeenCalled();
});
