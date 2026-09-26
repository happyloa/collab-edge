import { env } from 'cloudflare:workers';
import { drizzle } from 'drizzle-orm/d1';
import { and, desc, eq, lt } from 'drizzle-orm';
import { z } from 'zod';
import { events } from '../../../../../src/db/schema';
import { requireUser, boardAccess } from '../../../../../src/auth/session';
import { route } from '../../../../../src/lib/http';
import { eventSchema } from '../../../../../src/realtime/protocol';
import { LIMITS } from '../../../../../src/lib/limits';
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
  const beforeParam = url.searchParams.get('before');
  const before =
    beforeParam === null
      ? null
      : z.coerce
          .number()
          .int()
          .min(1)
          .max(LIMITS.eventsPerBoard)
          .parse(beforeParam);
  await boardAccess(user.id, id);
  const rows = await drizzle(env.DB)
    .select()
    .from(events)
    .where(
      before === null
        ? eq(events.boardId, id)
        : and(eq(events.boardId, id), lt(events.revision, before)),
    )
    .orderBy(desc(events.revision))
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  return Response.json({
    events: page.map((row) =>
      eventSchema.parse({ ...row, payload: JSON.parse(row.payload) }),
    ),
    nextBefore: rows.length > limit ? page.at(-1)!.revision : null,
  });
});
