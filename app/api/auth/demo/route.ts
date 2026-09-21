import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { body, route } from '../../../../src/lib/http';
import { assert } from '../../../../src/lib/errors';
import { digest } from '../../../../src/auth/crypto';
import { createSession } from '../../../../src/auth/session';
import { DEMO, seedDemo } from '../../../../src/db/demo';
export const POST = route(async (request) => {
  const { person } = await body(
    request,
    z.object({ person: z.enum(['Alice', 'Bob']) }),
  );
  const key = await digest(request.headers.get('CF-Connecting-IP') ?? 'local');
  assert(
    await env.AUTH_LIMITER.getByName(`demo:${key}`).consume({
      limit: 10,
      windowMs: 60000,
    }),
    429,
    'Please wait before starting another demo session',
  );
  assert(
    await env.AUTH_LIMITER.getByName('demo-global').consume({
      limit: 100,
      windowMs: 86400000,
    }),
    429,
    'Daily demo session quota reached',
  );
  await seedDemo(env.DB);
  return Response.json(
    { boardId: DEMO.board },
    { headers: { 'Set-Cookie': await createSession(DEMO[person], request) } },
  );
});
