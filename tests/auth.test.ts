import { env } from 'cloudflare:workers';
import { expect, it } from 'vitest';
import { authenticate, logout, session } from '../src/auth/routes';
const origin = 'https://auth.test';
const request = (path: string, data: unknown, cookie = '') =>
  new Request(`${origin}${path}`, {
    method: 'POST',
    headers: {
      Origin: origin,
      'Content-Type': 'application/json',
      Cookie: cookie,
      'CF-Connecting-IP': '192.0.2.100',
    },
    body: JSON.stringify(data),
  });
it('registers, signs in and invalidates a session server-side on logout', async () => {
  const email = `auth-${crypto.randomUUID()}@example.com`;
  const password = 'A-valid-test-password-2026';
  const registration = await authenticate(true)(
    request('/api/auth/register', { email, password, name: 'Test user' }),
  );
  expect(registration.status).toBe(201);
  const cookie = registration.headers.get('set-cookie')!;
  expect(cookie).toContain('HttpOnly');
  expect(cookie).toContain('Secure');
  expect(cookie).toContain('SameSite=Lax');
  const row = await env.DB.prepare('SELECT password FROM users WHERE email=?')
    .bind(email)
    .first<{ password: string }>();
  expect(row?.password).not.toBe(password);
  expect(row?.password).toMatch(/^pbkdf2-sha256\$600000/);
  const loggedIn = await authenticate(false)(
    request('/api/auth/login', { email, password }),
  );
  expect(loggedIn.status).toBe(200);
  const tokenCookie = loggedIn.headers.get('set-cookie')!.split(';')[0];
  const get = () =>
    session(
      new Request(`${origin}/api/auth/session`, {
        headers: { Cookie: tokenCookie },
      }),
    );
  expect(await (await get()).json()).toMatchObject({ user: { email } });
  expect(
    (await logout(request('/api/auth/logout', {}, tokenCookie))).status,
  ).toBe(200);
  expect(await (await get()).json()).toEqual({ user: null });
});
it('rejects cross-origin writes before any account is created', async () => {
  const req = request('/api/auth/register', {
    email: 'cross-origin@example.com',
    password: 'long-enough-password',
    name: 'No',
  });
  req.headers.set('origin', 'https://evil.test');
  expect((await authenticate(true)(req)).status).toBe(403);
  expect(
    await env.DB.prepare('SELECT id FROM users WHERE email=?')
      .bind('cross-origin@example.com')
      .first(),
  ).toBeNull();
});
it('rejects malformed payloads and passwords without returning credentials', async () => {
  const response = await authenticate(false)(
    request('/api/auth/login', { email: 'not-an-email', password: 'short' }),
  );
  expect(response.status).toBe(400);
  expect(await response.text()).not.toContain('short');
});
