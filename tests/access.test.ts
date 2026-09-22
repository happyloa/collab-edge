import { env } from 'cloudflare:workers';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { requireAccess } from '../src/auth/access';

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
it('requires a valid signed token for the configured owner', async () => {
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
