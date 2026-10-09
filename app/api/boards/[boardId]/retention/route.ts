import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { requireUser } from '../../../../../src/auth/session';
import { body, route } from '../../../../../src/lib/http';
import {
  pruneHistorySchema,
  type HistoryResult,
  type HistoryRetention,
} from '../../../../../src/boards/retention';
import { AppError } from '../../../../../src/lib/errors';

function boardId(request: Request) {
  return z.uuid().parse(new URL(request.url).pathname.split('/').at(-2));
}
function response(result: HistoryResult<HistoryRetention>) {
  if (!result.ok)
    throw new AppError(result.status, result.message, result.code);
  return Response.json(result.value);
}
export const GET = route(async (request) => {
  const user = await requireUser(request);
  const id = boardId(request);
  return response(
    await env.BOARD_ROOMS.getByName(id).historyRetention(id, user.id),
  );
});
export const POST = route(async (request) => {
  const user = await requireUser(request);
  const id = boardId(request);
  const input = await body(request, pruneHistorySchema);
  return response(
    await env.BOARD_ROOMS.getByName(id).pruneHistory(id, user.id, input),
  );
});
