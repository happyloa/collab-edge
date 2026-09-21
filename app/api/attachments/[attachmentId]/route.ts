import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { requireUser, boardAccess } from '../../../../src/auth/session';
import { route } from '../../../../src/lib/http';
import { assert } from '../../../../src/lib/errors';
async function authorize(request: Request, write = false) {
  const user = await requireUser(request);
  const id = z.uuid().parse(new URL(request.url).pathname.split('/').at(-1));
  const item = await env.DB.prepare(
    'SELECT id,board_id,object_key,filename FROM attachments WHERE id=?',
  )
    .bind(id)
    .first<{
      id: string;
      board_id: string;
      object_key: string;
      filename: string;
    }>();
  assert(item, 404, 'Attachment not found');
  await boardAccess(user.id, item.board_id, write);
  assert(
    env.ATTACHMENTS_ENABLED === 'true',
    403,
    'Attachments are disabled in this cost-limited environment',
  );
  return { user, item };
}
export const GET = route(async (request) => {
  const { item } = await authorize(request);
  assert(
    await env.AUTH_LIMITER.getByName('r2-operations').consume({
      limit: 1000,
      windowMs: 86400000,
    }),
    429,
    'Daily attachment operation limit reached',
  );
  const object = await env.ATTACHMENTS.get(item.object_key);
  assert(object, 404, 'File unavailable');
  return new Response(object.body, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(item.filename)}`,
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cache-Control': 'no-store',
    },
  });
});
export const DELETE = route(async (request) => {
  const { user, item } = await authorize(request, true);
  return Response.json(
    await env.BOARD_ROOMS.getByName(item.board_id).removeAttachment(
      item.board_id,
      user.id,
      item.id,
    ),
  );
});
