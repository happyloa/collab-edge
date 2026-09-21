import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { users, sessions } from '../db/schema';
import { body, route } from '../lib/http';
import { assert } from '../lib/errors';
import { digest, hashPassword, verifyPassword, sessionHash } from './crypto';
import { createSession, currentUser, tokenFrom } from './session';
const credentials = z.object({
  email: z.email().trim().toLowerCase().max(254),
  password: z.string().min(12).max(128),
  name: z.string().trim().min(1).max(80).optional(),
});
export const authenticate = (register: boolean) =>
  route(async (request) => {
    const data = await body(request, credentials);
    const ip = request.headers.get('CF-Connecting-IP') ?? 'local';
    const keys = [
      `ip:${await digest(ip)}`,
      `account:${await digest(data.email)}`,
      'auth-global',
    ];
    for (const key of keys)
      assert(
        await env.AUTH_LIMITER.getByName(key).consume({
          limit: key === 'auth-global' ? 200 : 10,
          windowMs: 60_000,
        }),
        429,
        'Too many attempts. Try again later.',
      );
    const db = drizzle(env.DB);
    if (register) {
      assert(
        env.REGISTRATION_ENABLED === 'true',
        403,
        'Registration is currently closed',
      );
      assert(data.name, 400, 'Display name required');
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
export const session = route(async (request) =>
  Response.json({ user: await currentUser(request) }),
);
