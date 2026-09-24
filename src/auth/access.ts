import { createRemoteJWKSet, jwtVerify } from 'jose';

// Only public verification keys are cached; never request identity or credentials.
let keyCache:
  { issuer: string; keys: ReturnType<typeof createRemoteJWKSet> } | undefined;
export async function verifiedAccessEmail(
  request: Request,
  env: Env,
): Promise<string | null> {
  if (env.ACCESS_REQUIRED !== 'true') return null;
  if (
    !/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.ACCESS_TEAM_DOMAIN) ||
    !env.ACCESS_AUD ||
    !env.ACCESS_ALLOWED_EMAIL
  )
    return null;
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token || token.length > 16384) return null;
  try {
    const issuer = `https://${env.ACCESS_TEAM_DOMAIN}`;
    if (keyCache?.issuer !== issuer)
      keyCache = {
        issuer,
        keys: createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`)),
      };
    const { payload } = await jwtVerify(token, keyCache.keys, {
      issuer,
      audience: env.ACCESS_AUD,
      algorithms: ['RS256'],
      requiredClaims: ['exp', 'iat', 'sub', 'email'],
    });
    if (typeof payload.email !== 'string') return null;
    const email = payload.email.toLowerCase();
    return email === env.ACCESS_ALLOWED_EMAIL.toLowerCase() ? email : null;
  } catch {
    return null;
  }
}

export async function requireAccess(
  request: Request,
  env: Env,
): Promise<Response | null> {
  if (env.ACCESS_REQUIRED === 'false') return null;
  if (await verifiedAccessEmail(request, env)) return null;
  return new Response(
    'Private workspace. Cloudflare Access authentication is required.',
    {
      status: 403,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/plain; charset=utf-8',
      },
    },
  );
}
