import { env } from 'cloudflare:workers';
import { drizzle } from 'drizzle-orm/d1';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { events } from '../../../../../src/db/schema';
import { requireUser, boardAccess } from '../../../../../src/auth/session';
import { route } from '../../../../../src/lib/http';
import { eventSchema } from '../../../../../src/realtime/protocol';
export const GET = route(async (request) => {
  const user = await requireUser(request);
  const url = new URL(request.url);
  const id = z.uuid().parse(url.pathname.split('/').at(-2));
  const limit = z.coerce
    .number()
    .int()
    .min(1)
    .max(50)
    .parse(url.searchParams.get('limit') ?? 30);
  await boardAccess(user.id, id);
  const rows = await drizzle(env.DB)
    .select()
    .from(events)
    .where(eq(events.boardId, id))
    .orderBy(desc(events.revision))
    .limit(limit);
  return Response.json(
    rows.map((row) =>
      eventSchema.parse({ ...row, payload: JSON.parse(row.payload) }),
    ),
  );
});
