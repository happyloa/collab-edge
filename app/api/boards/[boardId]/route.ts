import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { requireUser, boardAccess } from '../../../../src/auth/session';
import { route } from '../../../../src/lib/http';
export const GET = route(async (request) => {
  const user = await requireUser(request);
  const id = z.uuid().parse(new URL(request.url).pathname.split('/').at(-1));
  const { role } = await boardAccess(user.id, id);
  const snapshot = await env.BOARD_ROOMS.getByName(id).snapshot(id, user.id);
  return Response.json({ snapshot, role, user });
});
