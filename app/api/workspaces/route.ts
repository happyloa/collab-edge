import { env } from 'cloudflare:workers';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { workspaces, members } from '../../../src/db/schema';
import { requireUser } from '../../../src/auth/session';
import { body, route } from '../../../src/lib/http';
export const GET = route(async (request) => {
  const user = await requireUser(request);
  const rows = await drizzle(env.DB)
    .select({ id: workspaces.id, name: workspaces.name, role: members.role })
    .from(workspaces)
    .innerJoin(members, eq(members.workspaceId, workspaces.id))
    .where(eq(members.userId, user.id));
  return Response.json(rows);
});
export const POST = route(async (request) => {
  const user = await requireUser(request);
  const data = await body(
    request,
    z.object({ name: z.string().trim().min(1).max(80) }),
  );
  const db = drizzle(env.DB);
  const id = crypto.randomUUID();
  await db.batch([
    db.insert(workspaces).values({ id, name: data.name, ownerId: user.id }),
    db
      .insert(members)
      .values({ workspaceId: id, userId: user.id, role: 'OWNER' }),
  ]);
  return Response.json({ id }, { status: 201 });
});
