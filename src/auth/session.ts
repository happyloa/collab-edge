import { env } from 'cloudflare:workers';
import { drizzle } from 'drizzle-orm/d1';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { sessions, users, members, boards } from '../db/schema';
import { sessionHash } from './crypto';
import { assert } from '../lib/errors';

export function tokenFrom(request: Request) {
  return request.headers
    .get('cookie')
    ?.split(';')
    .map((v) => v.trim())
    .find((v) => v.startsWith('ce_session='))
    ?.slice(11);
}
export async function currentUser(request: Request) {
  const token = tokenFrom(request);
  if (!token) return null;
  const db = drizzle(env.DB);
  const result = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        eq(sessions.id, await sessionHash(token, env.SESSION_SECRET)),
        gt(sessions.expiresAt, Date.now()),
        isNull(users.deletedAt),
      ),
    )
    .get();
  return result ?? null;
}
export async function requireUser(request: Request) {
  const user = await currentUser(request);
  assert(user, 401, 'Please sign in');
  return user;
}
export async function workspaceRole(
  userId: string,
  workspaceId: string,
  write = false,
  owner = false,
) {
  const member = await drizzle(env.DB)
    .select()
    .from(members)
    .where(
      and(eq(members.userId, userId), eq(members.workspaceId, workspaceId)),
    )
    .get();
  assert(member, 403, 'Workspace access denied');
  assert(
    !write || member.role !== 'VIEWER',
    403,
    'Viewers cannot make changes',
  );
  assert(
    !owner || member.role === 'OWNER',
    403,
    'Only the owner can manage members',
  );
  return member.role;
}
export async function boardAccess(
  userId: string,
  boardId: string,
  write = false,
) {
  const board = await drizzle(env.DB)
    .select()
    .from(boards)
    .where(eq(boards.id, boardId))
    .get();
  assert(board, 404, 'Board not found');
  const role = await workspaceRole(userId, board.workspaceId, write);
  return { board, role };
}
export async function createSession(userId: string, request: Request) {
  assert(
    env.SESSION_SECRET?.length >= 32,
    503,
    'Session configuration unavailable',
  );
  const token = `${crypto.randomUUID()}${crypto.randomUUID()}`;
  const lifetime = 7 * 24 * 60 * 60;
  await drizzle(env.DB)
    .insert(sessions)
    .values({
      id: await sessionHash(token, env.SESSION_SECRET),
      userId,
      expiresAt: Date.now() + lifetime * 1000,
    });
  return `ce_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${lifetime}${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`;
}
