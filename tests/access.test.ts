import { env } from 'cloudflare:workers';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { requireAccess, verifiedAccessEmail } from '../src/auth/access';
import { createSession } from '../src/auth/session';
import { DEMO, seedDemo } from '../src/db/demo';
import {
  authenticate,
  resetPasswordFor,
  session,
  sessionFor,
  verifyEmailFor,
} from '../src/auth/routes';

const issuer = 'https://collabedge-test.cloudflareaccess.com';
const accessEnv = {
  ...env,
  ACCESS_REQUIRED: 'true',
  ACCESS_TEAM_DOMAIN: 'collabedge-test.cloudflareaccess.com',
  ACCESS_AUD: 'test-audience',
  ACCESS_ALLOWED_EMAIL: 'owner@example.com',
};
const pair = await generateKeyPair('RS256', { extractable: true });
beforeAll(async () => {
  const jwks = {
    keys: [
      { ...(await exportJWK(pair.publicKey)), kid: 'test-key', alg: 'RS256' },
    ],
  };
  vi.stubGlobal('fetch', async (url: string | URL) => {
    expect(String(url)).toBe(`${issuer}/cdn-cgi/access/certs`);
    return Response.json(jwks);
  });
});
afterAll(() => vi.unstubAllGlobals());
async function request(
  email: string,
  audience = 'test-audience',
  expiration = '1h',
) {
  const jwt = await new SignJWT({ email })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setIssuedAt()
    .setSubject('test-user')
    .setIssuer(issuer)
    .setAudience(audience)
    .setExpirationTime(expiration)
    .sign(pair.privateKey);
  return new Request('https://test.dev/', {
    headers: { 'Cf-Access-Jwt-Assertion': jwt },
  });
}
async function authRequest(
  path: string,
  data: unknown,
  email = 'owner@example.com',
) {
  const access = await request(email);
  return new Request(`https://test.dev${path}`, {
    method: 'POST',
    headers: {
      Origin: 'https://test.dev',
      'Content-Type': 'application/json',
      'CF-Connecting-IP': '192.0.2.101',
      'Cf-Access-Jwt-Assertion': access.headers.get('Cf-Access-Jwt-Assertion')!,
    },
    body: JSON.stringify(data),
  });
}
it('requires a valid signed token for the configured owner', async () => {
  expect(
    await verifiedAccessEmail(await request('owner@example.com'), accessEnv),
  ).toBe('owner@example.com');
  expect(
    await verifiedAccessEmail(await request('other@example.com'), accessEnv),
  ).toBeNull();
  expect(
    await requireAccess(await request('owner@example.com'), accessEnv),
  ).toBeNull();
  expect(
    (await requireAccess(await request('other@example.com'), accessEnv))
      ?.status,
  ).toBe(403);
  expect(
    (
      await requireAccess(
        await request('owner@example.com', 'other-app'),
        accessEnv,
      )
    )?.status,
  ).toBe(403);
  expect(
    (
      await requireAccess(
        await request('owner@example.com', 'test-audience', '-1s'),
        accessEnv,
      )
    )?.status,
  ).toBe(403);
});
it('fails closed for unconfigured Access and forged email headers', async () => {
  const spoofed = new Request('https://test.dev/', {
    headers: { 'Cf-Access-Authenticated-User-Email': 'owner@example.com' },
  });
  expect((await requireAccess(spoofed, accessEnv))?.status).toBe(403);
  expect(
    (await requireAccess(spoofed, { ...accessEnv, ACCESS_AUD: '' }))?.status,
  ).toBe(403);
});

it('binds new accounts to the verified Access email and resets only that account', async () => {
  const oldPassword = 'Old-password-for-owner-2026';
  const newPassword = 'New-password-for-owner-2026';
  const otherEmail = await authenticate(
    true,
    accessEnv,
  )(
    await authRequest('/api/auth/register', {
      email: 'someone-else@example.com',
      name: 'Wrong email',
      password: oldPassword,
    }),
  );
  expect(otherEmail.status).toBe(403);

  const registration = await authenticate(
    true,
    accessEnv,
  )(
    await authRequest('/api/auth/register', {
      email: 'owner@example.com',
      name: 'Owner',
      password: oldPassword,
    }),
  );
  expect(registration.status).toBe(201);
  const originalCookie = registration.headers.get('set-cookie')!.split(';')[0];

  const reset = await resetPasswordFor(accessEnv)(
    await authRequest('/api/auth/password-reset', { password: newPassword }),
  );
  expect(reset.status).toBe(200);
  expect(
    await (
      await session(
        new Request('https://test.dev/api/auth/session', {
          headers: { Cookie: originalCookie },
        }),
      )
    ).json(),
  ).toEqual({ user: null });
  expect(
    (
      await authenticate(
        false,
        accessEnv,
      )(
        await authRequest('/api/auth/login', {
          email: 'owner@example.com',
          password: oldPassword,
        }),
      )
    ).status,
  ).toBe(401);
  expect(
    (
      await authenticate(
        false,
        accessEnv,
      )(
        await authRequest('/api/auth/login', {
          email: 'owner@example.com',
          password: newPassword,
        }),
      )
    ).status,
  ).toBe(200);
});

it('does not permit password reset without a valid owner Access token', async () => {
  const missing = new Request('https://test.dev/api/auth/password-reset', {
    method: 'POST',
    headers: { Origin: 'https://test.dev', 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'New-password-for-owner-2026' }),
  });
  expect((await resetPasswordFor(accessEnv)(missing)).status).toBe(403);
  expect(
    (
      await resetPasswordFor(accessEnv)(
        await authRequest(
          '/api/auth/password-reset',
          { password: 'New-password-for-owner-2026' },
          'other@example.com',
        ),
      )
    ).status,
  ).toBe(403);
});

it('lets a signed-in legacy account adopt the Access-verified email', async () => {
  const registration = await authenticate(true)(
    await authRequest('/api/auth/register', {
      email: 'legacy@example.com',
      name: 'Legacy owner',
      password: 'Legacy-password-for-owner-2026',
    }),
  );
  expect(registration.status).toBe(201);
  const cookie = registration.headers.get('set-cookie')!.split(';')[0];
  const legacyAccessEnv = {
    ...accessEnv,
    ACCESS_ALLOWED_EMAIL: 'verified-legacy@example.com',
  };
  const makeRequest = async (path: string) => {
    const signed = await request('verified-legacy@example.com');
    return new Request(`https://test.dev${path}`, {
      method: path.endsWith('/session') ? 'GET' : 'POST',
      headers: {
        Origin: 'https://test.dev',
        Cookie: cookie,
        'Cf-Access-Jwt-Assertion': signed.headers.get(
          'Cf-Access-Jwt-Assertion',
        )!,
      },
    });
  };
  expect(
    await (
      await sessionFor(legacyAccessEnv)(await makeRequest('/api/auth/session'))
    ).json(),
  ).toMatchObject({ emailVerified: false });
  const updated = await verifyEmailFor(legacyAccessEnv)(
    await makeRequest('/api/auth/verify-email'),
  );
  expect(updated.status).toBe(200);
  expect(await updated.json()).toEqual({
    email: 'verified-legacy@example.com',
    verified: true,
  });
  expect(
    await (
      await sessionFor(legacyAccessEnv)(await makeRequest('/api/auth/session'))
    ).json(),
  ).toMatchObject({ emailVerified: true });
  const oldEmail = await env.DB.prepare('SELECT id FROM users WHERE email = ?')
    .bind('legacy@example.com')
    .first();
  expect(oldEmail).toBeNull();
});

it('does not let a seeded demo identity adopt a recoverable email', async () => {
  await seedDemo(env.DB);
  const cookie = (
    await createSession(DEMO.Alice, new Request('https://test.dev/'))
  ).split(';')[0];
  const signed = await request('owner@example.com');
  const response = await verifyEmailFor(accessEnv)(
    new Request('https://test.dev/api/auth/verify-email', {
      method: 'POST',
      headers: {
        Origin: 'https://test.dev',
        Cookie: cookie,
        'Cf-Access-Jwt-Assertion': signed.headers.get(
          'Cf-Access-Jwt-Assertion',
        )!,
      },
    }),
  );
  expect(response.status).toBe(403);
});
