import { z } from 'zod';
import { AppError, assert } from './errors';
import { LIMITS } from './limits';
export async function body<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<T> {
  assert(
    request.headers.get('content-type')?.includes('application/json'),
    415,
    'Expected JSON',
  );
  const reader = request.body?.getReader();
  assert(reader, 400, 'Missing request body');
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const result = await reader.read();
    if (result.done) break;
    length += result.value.length;
    if (length > LIMITS.requestBytes) {
      await reader.cancel();
      throw new AppError(413, 'Request too large');
    }
    chunks.push(result.value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return schema.parse(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    throw new AppError(400, 'Invalid request payload');
  }
}
export function route(fn: (request: Request) => Promise<Response>) {
  return async (request: Request) => {
    try {
      if (!['GET', 'HEAD'].includes(request.method)) {
        assert(
          request.headers.get('origin') === new URL(request.url).origin,
          403,
          'Invalid request origin',
        );
      }
      const response = await fn(request);
      response.headers.set('Cache-Control', 'no-store');
      response.headers.set('X-Content-Type-Options', 'nosniff');
      return response;
    } catch (error) {
      if (
        error instanceof Error &&
        /(?:quota|budget|capacity|limit) reached/i.test(error.message)
      ) {
        return Response.json(
          {
            error:
              'This demo has reached its usage limit. Please try again later or contact the owner.',
          },
          { status: 429, headers: { 'Cache-Control': 'no-store' } },
        );
      }
      if (error instanceof AppError)
        return Response.json(
          { error: error.message },
          { status: error.status },
        );
      if (error instanceof z.ZodError)
        return Response.json(
          { error: 'Invalid request payload' },
          { status: 400 },
        );
      console.error(
        JSON.stringify({
          event: 'request_failed',
          path: new URL(request.url).pathname,
          error: error instanceof Error ? error.message : 'Unknown error',
        }),
      );
      return Response.json(
        { error: 'Request failed. Please try again.' },
        { status: 500 },
      );
    }
  };
}
