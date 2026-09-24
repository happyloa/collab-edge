import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { users, sessions } from '../db/schema';
import { body, route } from '../lib/http';
import { assert } from '../lib/errors';
import { hashPassword, verifyPassword, sessionHash } from './crypto';
import { createSession, currentUser, requireUser, tokenFrom } from './session';
import { verifiedAccessEmail } from './access';
import { DEMO } from '../db/demo';

const demoIds = new Set([DEMO.owner, DEMO.Alice, DEMO.Bob]);
const credentials = z.object({
  email: z.email().trim().toLowerCase().max(254),
  password: z.string().min(12).max(128),
  name: z.string().trim().min(1).max(80).optional(),
});
const newPassword = z.object({ password: z.string().min(12).max(128) });

async function limitAuthAttempts(
  request: Request,
  email: string,
  authEnv: Env,
) {
  const ip = request.headers.get('CF-Connecting-IP') ?? 'local';
  const keys = [
    'auth-global',
    `ip:${await sessionHash(ip, authEnv.SESSION_SECRET)}`,
    `account:${await sessionHash(email, authEnv.SESSION_SECRET)}`,
  ];
  for (const key of keys)
    assert(
      await authEnv.AUTH_LIMITER.getByName(key).consume({
        limit: key === 'auth-global' ? 200 : 10,
        windowMs: 60_000,
      }),
      429,
      'Too many attempts. Try again later.',
    );
}

export const authenticate = (register: boolean, authEnv: Env = env) =>
  route(async (request) => {
    const data = await body(request, credentials);
    await limitAuthAttempts(request, data.email, authEnv);
    const db = drizzle(authEnv.DB);
    if (register) {
      assert(
        authEnv.REGISTRATION_ENABLED === 'true',
        403,
        'Registration is currently closed',
      );
      assert(data.name, 400, 'Display name required');
      if (authEnv.ACCESS_REQUIRED === 'true')
        assert(
          (await verifiedAccessEmail(request, authEnv)) === data.email,
          403,
          'Use your Cloudflare Access verified email',
        );
      const exists = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, data.email))
        .get();
      assert(!exists, 409, 'Unable to register this email');
      const id = crypto.randomUUID();
      await db.insert(users).values({
        id,
        email: data.email,
        name: data.name,
        password: await hashPassword(data.password),
        createdAt: Date.now(),
      });
      return Response.json(
        { user: { id, email: data.email, name: data.name } },
        {
          status: 201,
          headers: { 'Set-Cookie': await createSession(id, request) },
        },
      );
    }
    const user = await db
      .select()
      .from(users)
      .where(eq(users.email, data.email))
      .get();
    const valid = await verifyPassword(
      data.password,
      user?.password ??
        'pbkdf2-sha256$600000$00000000000000000000000000000000$0000000000000000000000000000000000000000000000000000000000000000',
    );
    assert(user && valid, 401, 'Invalid email or password');
    return Response.json(
      { user: { id: user.id, name: user.name, email: user.email } },
      { headers: { 'Set-Cookie': await createSession(user.id, request) } },
    );
  });

export const resetPasswordFor = (authEnv: Env = env) =>
  route(async (request) => {
    const email = await verifiedAccessEmail(request, authEnv);
    assert(email, 403, 'Verify your email with Cloudflare Access first');
    const data = await body(request, newPassword);
    await limitAuthAttempts(request, email, authEnv);
    const user = await drizzle(authEnv.DB)
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .get();
    assert(user, 404, 'No account uses your verified email');
    const password = await hashPassword(data.password);
    await authEnv.DB.batch([
      authEnv.DB.prepare('UPDATE users SET password = ? WHERE id = ?').bind(
        password,
        user.id,
      ),
      authEnv.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(
        user.id,
      ),
    ]);
    return Response.json({ ok: true });
  });

export const verifyEmailFor = (authEnv: Env = env) =>
  route(async (request) => {
    const email = await verifiedAccessEmail(request, authEnv);
    assert(email, 403, 'Verify your email with Cloudflare Access first');
    const user = await requireUser(request);
    if (user.email === email) return Response.json({ email, verified: true });
    assert(!demoIds.has(user.id), 403, 'Demo accounts cannot verify email');
    await limitAuthAttempts(request, email, authEnv);
    const db = drizzle(authEnv.DB);
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .get();
    assert(!existing, 409, 'Verified email already belongs to another account');
    await db.update(users).set({ email }).where(eq(users.id, user.id));
    return Response.json({ email, verified: true });
  });
export const logout = route(async (request) => {
  const token = tokenFrom(request);
  if (token)
    await drizzle(env.DB)
      .delete(sessions)
      .where(eq(sessions.id, await sessionHash(token, env.SESSION_SECRET)));
  return Response.json(
    { ok: true },
    {
      headers: {
        'Set-Cookie': `ce_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`,
      },
    },
  );
});
export const sessionFor = (authEnv: Env = env) =>
  route(async (request) => {
    const user = await currentUser(request);
    if (!user || authEnv.ACCESS_REQUIRED !== 'true')
      return Response.json({ user });
    const verifiedEmail = await verifiedAccessEmail(request, authEnv);
    return Response.json({
      user,
      emailVerified: user.email === verifiedEmail,
      verifiedEmail,
      canVerifyEmail: !demoIds.has(user.id),
    });
  });
export const session = sessionFor();
