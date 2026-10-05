import { expect, it, vi } from 'vitest';
import { z } from 'zod';
import { route } from '../src/lib/http';
import { AppError } from '../src/lib/errors';

it('applies security headers to successes, redirects and every error path', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const cases: [number, () => Promise<Response>][] = [
    [
      201,
      async () =>
        Response.json(
          { ok: true },
          { status: 201, headers: { 'Set-Cookie': 'session=test; HttpOnly' } },
        ),
    ],
    [302, async () => Response.redirect('https://http.test/login')],
    ...[400, 401, 403, 404, 409, 413, 415, 503].map(
      (status): [number, () => Promise<Response>] => [
        status,
        async () => {
          throw new AppError(status, 'Test error');
        },
      ],
    ),
    [
      429,
      async () => {
        throw new AppError(429, 'Too many attempts. Try again later.');
      },
    ],
    [
      429,
      async () => {
        throw new Error('Global event storage budget reached');
      },
    ],
    [
      400,
      async () => {
        z.string().parse(42);
        return Response.json({});
      },
    ],
    [
      500,
      async () => {
        throw new Error('Internal private query data');
      },
    ],
  ];
  try {
    for (const [status, handler] of cases) {
      const response = await route(handler)(
        new Request('https://http.test/api/test'),
      );
      expect(response.status).toBe(status);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
      if (status === 201)
        expect(response.headers.get('set-cookie')).toBe(
          'session=test; HttpOnly',
        );
      if (status === 302)
        expect(response.headers.get('location')).toBe(
          'https://http.test/login',
        );
      if (status >= 400)
        expect(await response.json()).toMatchObject({
          code: expect.any(String),
          error: expect.any(String),
        });
    }
    expect(log.mock.calls.flat().join('')).not.toContain(
      'Internal private query data',
    );
  } finally {
    log.mockRestore();
  }
});

it('distinguishes auth rate limits from exhausted storage and keeps retry metadata', async () => {
  const request = new Request('https://http.test/api/test');
  const limited = await route(async () => {
    throw new AppError(429, 'Too many attempts. Try again later.');
  })(request);
  expect(limited.headers.get('retry-after')).toBe('60');
  expect(await limited.json()).toMatchObject({ code: 'RATE_LIMITED' });
  const exhausted = await route(async () => {
    throw new Error('Global board capacity reached');
  })(request);
  expect(exhausted.headers.get('retry-after')).toBeNull();
  expect(await exhausted.json()).toMatchObject({ code: 'USAGE_LIMIT' });
  const knownMessage = 'Database daily capacity reached. Try again tomorrow.';
  const knownLimit = await route(async () => {
    throw new AppError(429, knownMessage, 'USAGE_LIMIT');
  })(request);
  expect(knownLimit.status).toBe(429);
  expect(await knownLimit.json()).toEqual({
    error: knownMessage,
    code: 'USAGE_LIMIT',
  });
  expect(knownLimit.headers.get('retry-after')).toBeNull();
});
