/** Limits downstream work; Workers Free provides the platform's billing boundary. */
export async function requestBudget(
  request: Request,
  env: Env,
): Promise<Response | null> {
  const reject = (
    message: string,
    status: number,
    retryAfter: string,
    code = httpErrorCode(status),
  ) =>
    Response.json(
      { error: message, code },
      {
        status,
        headers: {
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
          'Retry-After': retryAfter,
        },
      },
    );
  try {
    const ip = request.headers.get('CF-Connecting-IP') ?? 'local';
    const { success } = await env.REQUEST_LIMITER.limit({ key: ip });
    if (!success)
      return reject('Too many requests. Please wait a minute.', 429, '60');
    const allowed = await env.AUTH_LIMITER.getByName(
      'site-requests-daily-v1',
    ).consume({ limit: 5000, windowMs: 86400000 });
    if (!allowed)
      return reject(
        'The site has reached its daily usage limit. Please try again tomorrow.',
        429,
        '86400',
        'USAGE_LIMIT',
      );
    return null;
  } catch {
    return reject(
      'The usage guard is temporarily unavailable. Please try again later.',
      503,
      '60',
    );
  }
}
import { httpErrorCode } from './errors';
