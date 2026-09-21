import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { requireUser, boardAccess } from '../../../../../src/auth/session';
import { route } from '../../../../../src/lib/http';
import { assert, AppError } from '../../../../../src/lib/errors';
import { uploadMetadata } from '../../../../../src/validation/uploads';
export const POST = route(async (request) => {
  const user = await requireUser(request);
  const cardId = z
    .uuid()
    .parse(new URL(request.url).pathname.split('/').at(-2));
  const card = await env.DB.prepare('SELECT board_id FROM cards WHERE id=?')
    .bind(cardId)
    .first<{ board_id: string }>();
  assert(card, 404, 'Card not found');
  await boardAccess(user.id, card.board_id, true);
  assert(
    env.ATTACHMENTS_ENABLED === 'true',
    403,
    'Attachments are disabled in this cost-limited environment',
  );
  const meta = uploadMetadata.parse({
    filename: decodeURIComponent(request.headers.get('x-filename') ?? ''),
    mime: request.headers.get('content-type'),
    size: Number(request.headers.get('content-length')),
  });
  const reader = request.body?.getReader();
  assert(reader, 400, 'Missing file');
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.length;
    if (size > meta.size) {
      await reader.cancel();
      throw new AppError(413, 'File size mismatch');
    }
    chunks.push(chunk.value);
  }
  assert(size === meta.size, 400, 'File size mismatch');
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return Response.json(
    await env.BOARD_ROOMS.getByName(card.board_id).upload(
      card.board_id,
      user.id,
      cardId,
      meta,
      bytes.buffer,
    ),
    { status: 201 },
  );
});
