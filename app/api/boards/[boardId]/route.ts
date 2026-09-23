import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { requireUser, boardAccess } from '../../../../src/auth/session';
import { route } from '../../../../src/lib/http';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { members, users } from '../../../../src/db/schema';
export const GET = route(async (request) => {
  const user = await requireUser(request);
  const id = z.uuid().parse(new URL(request.url).pathname.split('/').at(-1));
  const { role } = await boardAccess(user.id, id);
  const snapshot = await env.BOARD_ROOMS.getByName(id).snapshot(id, user.id);
  const people = await drizzle(env.DB)
    .select({ id: users.id, name: users.name })
    .from(members)
    .innerJoin(users, eq(users.id, members.userId))
    .where(eq(members.workspaceId, snapshot.board.workspaceId));
  return Response.json({ snapshot, role, user, people });
});
