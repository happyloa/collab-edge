import { expect, it } from 'vitest';
import { withSecurityHeaders } from '../src/lib/security-headers';

const secure = new Request('https://collab.test/workspaces');

it('adds baseline browser protections to pages and API responses', async () => {
  const response = withSecurityHeaders(
    Response.json({ ok: true }, { status: 201, statusText: 'Created' }),
    secure,
  );
  expect(response.status).toBe(201);
  expect(await response.json()).toEqual({ ok: true });
  expect(response.headers.get('Content-Type')).toContain('application/json');
  expect(response.headers.get('X-Frame-Options')).toBe('DENY');
  expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
  expect(response.headers.get('Referrer-Policy')).toBe(
    'strict-origin-when-cross-origin',
  );
  expect(response.headers.get('Permissions-Policy')).toContain('camera=()');
  const policy = response.headers.get('Content-Security-Policy') ?? '';
  for (const directive of [
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
    "form-action 'self'",
  ])
    expect(policy).toContain(directive);
  expect(response.headers.get('Strict-Transport-Security')).toBe(
    'max-age=31536000',
  );
});

it('keeps stricter route headers, redirects and local HTTP untouched by HSTS', () => {
  const download = withSecurityHeaders(
    new Response('file', {
      headers: {
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'Referrer-Policy': 'no-referrer',
      },
    }),
    secure,
  );
  expect(download.headers.get('Content-Security-Policy')).toBe(
    "default-src 'none'; sandbox",
  );
  expect(download.headers.get('Referrer-Policy')).toBe('no-referrer');

  const redirect = withSecurityHeaders(
    Response.redirect('https://collab.test/login', 307),
    secure,
  );
  expect(redirect.status).toBe(307);
  expect(redirect.headers.get('Location')).toBe('https://collab.test/login');
  expect(redirect.headers.get('X-Frame-Options')).toBe('DENY');

  const local = withSecurityHeaders(
    new Response('ok'),
    new Request('http://localhost:3000/'),
  );
  expect(local.headers.get('X-Frame-Options')).toBe('DENY');
  expect(local.headers.has('Strict-Transport-Security')).toBe(false);
});

it('returns WebSocket upgrades unchanged', () => {
  const [client] = Object.values(new WebSocketPair());
  const upgrade = new Response(null, { status: 101, webSocket: client });
  expect(withSecurityHeaders(upgrade, secure)).toBe(upgrade);
});
