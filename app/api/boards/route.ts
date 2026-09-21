import { env } from 'cloudflare:workers';
import { drizzle } from 'drizzle-orm/d1';
import { z } from 'zod';
import { boards, columns } from '../../../src/db/schema';
import { requireUser, workspaceRole } from '../../../src/auth/session';
import { body, route } from '../../../src/lib/http';
export const POST = route(async (request) => {
  const user = await requireUser(request);
  const data = await body(
    request,
    z.object({ workspaceId: z.uuid(), name: z.string().trim().min(1).max(80) }),
  );
  await workspaceRole(user.id, data.workspaceId, true);
  const id = crypto.randomUUID();
  const db = drizzle(env.DB);
  await db.batch([
    db.insert(boards).values({ id, ...data }),
    db.insert(columns).values(
      ['Backlog', 'In Progress', 'Review', 'Done'].map((title, position) => ({
        id: crypto.randomUUID(),
        boardId: id,
        title,
        position,
        updatedRevision: 0,
        titleRevision: 0,
      })),
    ),
  ]);
  return Response.json({ id }, { status: 201 });
});
