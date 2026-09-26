import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { drizzle } from 'drizzle-orm/d1';
import { and, eq, isNull } from 'drizzle-orm';
import { users, sessions } from '../db/schema';
import { body, route } from '../lib/http';
import { AppError, assert } from '../lib/errors';
import { hashPassword, verifyPassword, sessionHash } from './crypto';
import { createSession, currentUser, requireUser, tokenFrom } from './session';
import { verifiedAccessEmail } from './access';
import { DEMO } from '../db/demo';
import { confirmPassword } from './reauth';

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
      .where(and(eq(users.email, data.email), isNull(users.deletedAt)))
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
      .where(and(eq(users.email, email), isNull(users.deletedAt)))
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
    if (!user) return Response.json({ user });
    if (authEnv.ACCESS_REQUIRED !== 'true')
      return Response.json({
        user,
        canDeleteAccount: !demoIds.has(user.id),
      });
    const verifiedEmail = await verifiedAccessEmail(request, authEnv);
    return Response.json({
      user,
      emailVerified: user.email === verifiedEmail,
      verifiedEmail,
      canVerifyEmail: !demoIds.has(user.id),
      canDeleteAccount: !demoIds.has(user.id),
    });
  });
export const session = sessionFor();

export const deleteAccountFor = (authEnv: Env = env) =>
  route(async (request) => {
    const user = await requireUser(request);
    assert(!demoIds.has(user.id), 403, 'Demo accounts cannot be deleted');
    const data = await body(
      request,
      z.object({
        password: z.string().min(1).max(128),
        confirm: z.literal(true),
      }),
    );
    await confirmPassword(authEnv, user.id, data.password);
    const owned = await authEnv.DB.prepare(
      'SELECT 1 FROM workspaces WHERE owner_id=? LIMIT 1',
    )
      .bind(user.id)
      .first();
    assert(
      !owned,
      409,
      'Transfer ownership of your workspaces before deleting your account',
    );
    try {
      await authEnv.DB.batch([
        authEnv.DB.prepare(
          `INSERT INTO mutation_guard(value)
           SELECT CASE WHEN EXISTS(
             SELECT 1 FROM users WHERE id=? AND deleted_at IS NULL
           ) AND NOT EXISTS(
             SELECT 1 FROM workspaces WHERE owner_id=?
           ) THEN 1 ELSE 0 END`,
        ).bind(user.id, user.id),
        authEnv.DB.prepare(
          `UPDATE users SET email=?, name='Deleted account',
           password='disabled-deleted-account-login', created_at=0, deleted_at=?
           WHERE id=? AND deleted_at IS NULL`,
        ).bind(
          `deleted-${crypto.randomUUID()}@collabedge.invalid`,
          Date.now(),
          user.id,
        ),
        authEnv.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(
          user.id,
        ),
        authEnv.DB.prepare(
          'DELETE FROM workspace_members WHERE user_id=?',
        ).bind(user.id),
        authEnv.DB.prepare(
          'DELETE FROM workspace_transfers WHERE from_user_id=? OR to_user_id=?',
        ).bind(user.id, user.id),
        authEnv.DB.prepare('DELETE FROM mutation_guard'),
      ]);
    } catch (error) {
      if (
        error instanceof Error &&
        /CHECK constraint failed.*(?:mutation_guard|value)/i.test(error.message)
      )
        throw new AppError(
          409,
          'Account or workspace state changed. Reload and retry.',
        );
      throw error;
    }
    return Response.json(
      { ok: true },
      {
        headers: {
          'Set-Cookie': `ce_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`,
        },
      },
    );
  });
