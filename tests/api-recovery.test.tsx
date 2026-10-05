import '@testing-library/jest-dom/vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ApiErrorNotice } from '../components/ui/api-error-notice';
import { LocaleProvider } from '../components/ui/i18n';
import { ApiError } from '../src/lib/api-client';
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it('offers separate-tab sign-in without clearing the current form and distinguishes incorrect credentials', () => {
  const content = (error: ApiError) => (
    <>
      <input aria-label="Draft" defaultValue="Original" />
      <ApiErrorNotice error={error} />
    </>
  );
  const { rerender } = render(
    content(new ApiError('Session expired', 401, 'UNAUTHENTICATED')),
  );
  fireEvent.change(screen.getByLabelText('Draft'), {
    target: { value: 'My unsaved edit' },
  });
  const link = screen.getByRole('link', { name: 'Sign in in another tab' });
  expect(link).toHaveAttribute('href', '/login');
  expect(link).toHaveAttribute('target', '_blank');
  expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  rerender(
    content(
      new ApiError('Invalid email or password', 401, 'INVALID_CREDENTIALS'),
    ),
  );
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Draft')).toHaveValue('My unsaved edit');
});

it('translates retry metadata and waits before enabling the manual retry', () => {
  vi.useFakeTimers();
  const retry = vi.fn();
  render(
    <LocaleProvider initialLocale="zh-TW">
      <ApiErrorNotice
        error={
          new ApiError(
            'Too many requests. Please wait before trying again.',
            429,
            'RATE_LIMITED',
            2,
          )
        }
        onRetry={retry}
      />
    </LocaleProvider>,
  );
  const button = screen.getByRole('button', { name: '重試' });
  expect(button).toBeDisabled();
  expect(screen.getByRole('alert')).toHaveTextContent('請在 2 秒後重試。');
  fireEvent.click(button);
  expect(retry).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(2000));
  expect(button).toBeEnabled();
  fireEvent.click(button);
  expect(retry).toHaveBeenCalledTimes(1);
});
