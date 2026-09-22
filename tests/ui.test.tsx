import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Attachments } from '../components/board/attachments';
import { ThemeToggle } from '../components/ui/theme';
afterEach(cleanup);
it('viewers can download attachments but cannot upload or remove', () => {
  render(
    <Attachments
      cardId="card"
      readOnly
      items={[
        {
          id: 'file',
          cardId: 'card',
          boardId: 'board',
          filename: 'notes.txt',
          mime: 'text/plain',
          size: 20,
          actorId: 'alice',
          createdAt: '',
        },
      ]}
    />,
  );
  expect(screen.getByRole('link', { name: 'notes.txt' })).toHaveAttribute(
    'href',
    '/api/attachments/file',
  );
  expect(screen.queryByText('Remove')).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/Upload a file/)).not.toBeInTheDocument();
});
it('rejects oversize uploads before sending their bytes', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch');
  render(<Attachments cardId="card" readOnly={false} items={[]} />);
  const file = new File(['small'], 'huge.txt', { type: 'text/plain' });
  Object.defineProperty(file, 'size', { value: 11 * 1024 * 1024 });
  fireEvent.change(screen.getByLabelText(/Upload a file/), {
    target: { files: [file] },
  });
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Maximum file size is 10 MB',
  );
  expect(fetch).not.toHaveBeenCalled();
  fetch.mockRestore();
});
it('provides a keyboard-accessible theme control', () => {
  render(<ThemeToggle />);
  const toggle = screen.getByRole('button', { name: 'Toggle color theme' });
  toggle.focus();
  expect(toggle).toHaveFocus();
  const style = vi.spyOn(window, 'getComputedStyle');
  style.mockReturnValue({ colorScheme: 'light' } as CSSStyleDeclaration);
  fireEvent.click(toggle);
  expect(document.documentElement.dataset.theme).toBe('dark');
  style.mockReturnValue({ colorScheme: 'dark' } as CSSStyleDeclaration);
  fireEvent.click(toggle);
  expect(document.documentElement.dataset.theme).toBe('light');
  style.mockRestore();
});
