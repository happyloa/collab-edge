import { env } from 'cloudflare:workers';
import { expect, it, vi } from 'vitest';
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
  expect(row?.password).toMatch(/^pbkdf2-sha256-peppered\$100000/);
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

it('rolls back registration when the session insert fails, then allows a retry', async () => {
  const email = `rollback-${crypto.randomUUID()}@example.com`;
  const data = {
    email,
    password: 'A-rollback-password-2026',
    name: 'Retry user',
  };
  // The generated email contains only a fixed prefix, UUID and fixed domain.
  await env.DB.prepare(
    `CREATE TRIGGER fail_registration_session
    BEFORE INSERT ON sessions
    WHEN NEW.user_id IN (SELECT id FROM users WHERE email='${email}')
    BEGIN SELECT RAISE(ABORT,'Test session insert failure'); END;`,
  ).run();
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    const failed = await authenticate(true)(
      request('/api/auth/register', data),
    );
    expect(failed.status).toBe(500);
    expect(failed.headers.get('set-cookie')).toBeNull();
    expect(
      await env.DB.prepare('SELECT id FROM users WHERE email=?')
        .bind(email)
        .first(),
    ).toBeNull();
    expect(log.mock.calls.flat().join('')).not.toContain(email);
  } finally {
    await env.DB.exec('DROP TRIGGER fail_registration_session');
    log.mockRestore();
  }
  const retried = await authenticate(true)(request('/api/auth/register', data));
  expect(retried.status).toBe(201);
  const cookie = retried.headers.get('set-cookie')!;
  expect(
    await (
      await session(
        new Request(`${origin}/api/auth/session`, {
          headers: { Cookie: cookie },
        }),
      )
    ).json(),
  ).toMatchObject({ user: { email } });
});

it('creates only one account and session during concurrent registration', async () => {
  const email = `concurrent-${crypto.randomUUID()}@example.com`;
  const data = {
    email,
    password: 'A-concurrent-password-2026',
    name: 'One user',
  };
  const results = await Promise.all([
    authenticate(true)(request('/api/auth/register', data)),
    authenticate(true)(request('/api/auth/register', data)),
  ]);
  expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
  expect(
    results.filter((result) => result.headers.has('set-cookie')),
  ).toHaveLength(1);
  expect(
    await env.DB.prepare('SELECT count(*) AS count FROM users WHERE email=?')
      .bind(email)
      .first(),
  ).toEqual({ count: 1 });
  expect(
    await env.DB.prepare(
      'SELECT count(*) AS count FROM sessions JOIN users ON users.id=sessions.user_id WHERE users.email=?',
    )
      .bind(email)
      .first(),
  ).toEqual({ count: 1 });
});

it('keeps the lifetime account quota enforced during transactional registration', async () => {
  const { count } = (await env.DB.prepare(
    'SELECT count(*) AS count FROM users',
  ).first<{ count: number }>())!;
  await env.DB.batch(
    Array.from({ length: 100 - count }, (_, index) =>
      env.DB.prepare(
        'INSERT INTO users(id,email,name,password,created_at) VALUES(?,?,?, ?,0)',
      ).bind(
        crypto.randomUUID(),
        `quota-${index}@example.com`,
        'Quota user',
        '!',
      ),
    ),
  );
  const email = `blocked-${crypto.randomUUID()}@example.com`;
  const response = await authenticate(true)(
    request('/api/auth/register', {
      email,
      password: 'A-quota-password-2026',
      name: 'Blocked user',
    }),
  );
  expect(response.status).toBe(429);
  expect(await response.json()).toMatchObject({ code: 'USAGE_LIMIT' });
  expect(response.headers.get('set-cookie')).toBeNull();
  expect(
    await env.DB.prepare('SELECT id FROM users WHERE email=?')
      .bind(email)
      .first(),
  ).toBeNull();
});
