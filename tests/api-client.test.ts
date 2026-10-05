import { afterEach, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { api, ApiError, shouldRetryApiError } from '../src/lib/api-client';
afterEach(() => vi.restoreAllMocks());

it('retains status, server codes and both forms of Retry-After', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch');
  for (const [status, code] of [
    [401, 'UNAUTHENTICATED'],
    [401, 'INVALID_CREDENTIALS'],
    [403, 'FORBIDDEN'],
    [429, 'USAGE_LIMIT'],
  ] as const) {
    fetch.mockResolvedValueOnce(
      Response.json(
        { error: 'A safe message', code },
        { status, headers: { 'Retry-After': '60' } },
      ),
    );
    await expect(api('/api/test')).rejects.toMatchObject({
      status,
      code,
      message: 'A safe message',
      retryAfterSeconds: 60,
    });
  }
  const date = Date.UTC(2026, 9, 5, 0, 0, 0);
  vi.spyOn(Date, 'now').mockReturnValue(date);
  fetch.mockResolvedValueOnce(
    Response.json(
      {},
      {
        status: 503,
        headers: { 'Retry-After': new Date(date + 120000).toUTCString() },
      },
    ),
  );
  await expect(api('/api/test')).rejects.toMatchObject({
    retryAfterSeconds: 120,
    retryAt: date + 120000,
  });
});

it('handles Access redirects, HTML gateways and malformed responses without exposing their bodies', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch');
  const cases: [Response, number, string][] = [
    [Response.redirect('https://access.test/login'), 302, 'ACCESS_REQUIRED'],
    [
      new Response('<html>private login markup</html>', {
        headers: { 'Content-Type': 'text/html' },
      }),
      200,
      'ACCESS_REQUIRED',
    ],
    [
      new Response('<html>private gateway details</html>', {
        status: 502,
        headers: { 'Content-Type': 'text/html' },
      }),
      502,
      'HTTP_ERROR',
    ],
    [
      new Response('{', { headers: { 'Content-Type': 'application/json' } }),
      200,
      'INVALID_RESPONSE',
    ],
    [
      new Response('', { headers: { 'Content-Type': 'application/json' } }),
      200,
      'INVALID_RESPONSE',
    ],
  ];
  for (const [response, status, code] of cases) {
    fetch.mockResolvedValueOnce(response);
    const error = await api('/api/test').catch((error: unknown) => error);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status, code });
    expect(String(error)).not.toMatch(
      /private|SyntaxError|Unexpected end of JSON/,
    );
  }
  const opaque = new Response(null);
  Object.defineProperty(opaque, 'type', { value: 'opaqueredirect' });
  Object.defineProperty(opaque, 'status', { value: 0 });
  fetch.mockResolvedValueOnce(opaque);
  await expect(api('/api/test')).rejects.toMatchObject({
    status: 0,
    code: 'ACCESS_REQUIRED',
  });
});

it('accepts empty no-content replies and preserves upload headers and cancellation signals', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch');
  const controller = new AbortController();
  fetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
  await expect(
    api<void>('/api/test', { signal: controller.signal }),
  ).resolves.toBeUndefined();
  fetch.mockResolvedValueOnce(new Response(null, { status: 205 }));
  await expect(api<void>('/api/test')).resolves.toBeUndefined();
  const headers = new Headers({
    'Content-Type': 'text/plain',
    'X-Filename': 'notes.txt',
  });
  fetch.mockResolvedValueOnce(Response.json({ ok: true }));
  await api('/api/upload', {
    method: 'POST',
    body: 'notes',
    headers,
    signal: controller.signal,
  });
  const options = fetch.mock.calls.at(-1)![1]!;
  expect(options.signal).toBe(controller.signal);
  expect(options.redirect).toBe('manual');
  expect(new Headers(options.headers).get('Content-Type')).toBe('text/plain');
  expect(new Headers(options.headers).get('X-Filename')).toBe('notes.txt');
});

it('classifies offline failures but leaves aborts intact and does not retry mutations', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch');
  fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
  await expect(api('/api/test', { method: 'POST' })).rejects.toMatchObject({
    status: 0,
    code: 'NETWORK_ERROR',
  });
  expect(fetch).toHaveBeenCalledTimes(1);
  const controller = new AbortController();
  const aborted = new DOMException('Cancelled by caller', 'AbortError');
  fetch.mockImplementationOnce(
    (_url, options) =>
      new Promise((_resolve, reject) =>
        options?.signal?.addEventListener('abort', () => reject(aborted), {
          once: true,
        }),
      ),
  );
  const request = api('/api/test', { signal: controller.signal });
  controller.abort();
  await expect(request).rejects.toBe(aborted);
  expect(shouldRetryApiError(0, aborted)).toBe(false);
});

it('retries a transient query once, but never retries auth, permission, quota or Retry-After replies', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch');
  const client = new QueryClient({
    defaultOptions: { queries: { retry: shouldRetryApiError, retryDelay: 0 } },
  });
  try {
    fetch
      .mockResolvedValueOnce(new Response('gateway error', { status: 502 }))
      .mockResolvedValueOnce(Response.json({ ok: true }));
    await expect(
      client.fetchQuery({
        queryKey: ['transient'],
        queryFn: ({ signal }) => api('/api/test', { signal }),
      }),
    ).resolves.toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledTimes(2);
    for (const status of [401, 403, 429, 503]) {
      fetch.mockClear();
      fetch.mockResolvedValue(
        Response.json(
          {},
          { status, headers: status === 503 ? { 'Retry-After': '60' } : {} },
        ),
      );
      await expect(
        client.fetchQuery({
          queryKey: ['permanent', status],
          queryFn: ({ signal }) => api('/api/test', { signal }),
        }),
      ).rejects.toBeInstanceOf(ApiError);
      expect(fetch).toHaveBeenCalledTimes(1);
    }
    fetch.mockClear();
    fetch.mockRejectedValue(new TypeError('Offline'));
    await expect(
      client.fetchQuery({
        queryKey: ['offline'],
        queryFn: ({ signal }) => api('/api/test', { signal }),
      }),
    ).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
    expect(fetch).toHaveBeenCalledTimes(2);
  } finally {
    client.clear();
  }
});
