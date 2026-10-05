import { httpErrorCode } from './errors';
import { activateDraftOwner, clearDrafts } from '../drafts/store';

export class ApiError extends Error {
  readonly retryAt: number | null;
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = 'ApiError';
    this.retryAt =
      retryAfterSeconds === null ? null : Date.now() + retryAfterSeconds * 1000;
  }
}

export function asError(error: unknown, fallback = 'Request failed'): Error {
  return error instanceof Error ? error : new Error(fallback);
}

export function shouldRetryApiError(
  failureCount: number,
  error: unknown,
): boolean {
  return (
    failureCount < 1 &&
    error instanceof ApiError &&
    error.retryAfterSeconds === null &&
    error.code !== 'INVALID_RESPONSE' &&
    (error.code === 'NETWORK_ERROR' ||
      [408, 500, 502, 503, 504].includes(error.status))
  );
}

function retryAfter(value: string | null): number | null {
  if (value === null) return null;
  if (/^\d+$/.test(value.trim())) {
    const seconds = Number(value);
    return Number.isSafeInteger(seconds) ? seconds : null;
  }
  const date = Date.parse(value);
  return Number.isFinite(date)
    ? Math.max(0, Math.ceil((date - Date.now()) / 1000))
    : null;
}

function fallbackMessage(status: number): string {
  if (status === 401) return 'Session expired';
  if (status === 403)
    return 'You do not have permission to perform this action.';
  if (status === 429)
    return 'Too many requests. Please wait before trying again.';
  if (status >= 500)
    return 'The service is temporarily unavailable. Please try again later.';
  return 'Request failed';
}

export async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const headers = new Headers(options?.headers);
  if (!headers.has('Content-Type') && !(options?.body instanceof FormData))
    headers.set('Content-Type', 'application/json');
  let response: Response;
  try {
    response = await fetch(url, { ...options, headers, redirect: 'manual' });
  } catch (error) {
    if (
      options?.signal?.aborted ||
      (error instanceof Error && error.name === 'AbortError')
    )
      throw error;
    throw new ApiError(
      'Connection lost. Check your network and try again.',
      0,
      'NETWORK_ERROR',
    );
  }
  // Access redirects must be handled by a user navigation, not followed by fetch.
  if (
    response.type === 'opaqueredirect' ||
    (response.status >= 300 && response.status < 400)
  )
    throw new ApiError('Session expired', response.status, 'ACCESS_REQUIRED');
  if (
    response.ok &&
    (response.status === 204 ||
      response.status === 205 ||
      options?.method?.toUpperCase() === 'HEAD')
  )
    return undefined as T;
  const contentType =
    response.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() ??
    '';
  const isJson =
    contentType === 'application/json' || contentType.endsWith('+json');
  if (!isJson) {
    if (response.ok && contentType === 'text/html')
      throw new ApiError('Session expired', response.status, 'ACCESS_REQUIRED');
    throw new ApiError(
      response.ok
        ? 'Unexpected server response'
        : fallbackMessage(response.status),
      response.status,
      response.ok ? 'INVALID_RESPONSE' : httpErrorCode(response.status),
      retryAfter(response.headers.get('Retry-After')),
    );
  }
  let data: unknown;
  try {
    data = await response.json();
  } catch (error) {
    if (
      options?.signal?.aborted ||
      (error instanceof Error && error.name === 'AbortError')
    )
      throw error;
    throw new ApiError(
      response.ok
        ? 'Unexpected server response'
        : fallbackMessage(response.status),
      response.status,
      response.ok ? 'INVALID_RESPONSE' : httpErrorCode(response.status),
      retryAfter(response.headers.get('Retry-After')),
    );
  }
  if (!response.ok) {
    const payload = data && typeof data === 'object' ? data : {};
    const message =
      'error' in payload && typeof payload.error === 'string'
        ? payload.error
        : fallbackMessage(response.status);
    const code =
      'code' in payload && typeof payload.code === 'string'
        ? payload.code
        : message === 'Invalid email or password'
          ? 'INVALID_CREDENTIALS'
          : httpErrorCode(response.status);
    throw new ApiError(
      message,
      response.status,
      code,
      retryAfter(response.headers.get('Retry-After')),
    );
  }
  if (typeof window !== 'undefined') {
    const method = options?.method?.toUpperCase();
    try {
      if (
        method === 'POST' &&
        ['/api/auth/login', '/api/auth/register', '/api/auth/demo'].includes(
          url,
        )
      ) {
        const result = data as {
          user?: { id?: unknown };
          userId?: unknown;
        } | null;
        const ownerId = result?.user?.id ?? result?.userId;
        if (typeof ownerId === 'string') await activateDraftOwner(ownerId);
      } else if (
        (method === 'POST' &&
          ['/api/auth/logout', '/api/auth/password-reset'].includes(url)) ||
        (method === 'DELETE' && url === '/api/auth/account')
      ) {
        await clearDrafts();
      }
    } catch {
      // Storage restrictions must not turn a successful authentication into a
      // failed login. Board draft reads/writes report storage failures visibly.
    }
  }
  return data as T;
}
