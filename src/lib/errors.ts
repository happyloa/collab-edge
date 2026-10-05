export function httpErrorCode(status: number): string {
  const codes: Record<number, string> = {
    400: 'INVALID_REQUEST',
    401: 'UNAUTHENTICATED',
    403: 'FORBIDDEN',
    404: 'NOT_FOUND',
    409: 'CONFLICT',
    413: 'PAYLOAD_TOO_LARGE',
    415: 'UNSUPPORTED_MEDIA_TYPE',
    429: 'RATE_LIMITED',
    500: 'INTERNAL_ERROR',
    503: 'SERVICE_UNAVAILABLE',
  };
  return codes[status] ?? 'HTTP_ERROR';
}
export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = httpErrorCode(status),
  ) {
    super(message);
  }
}
export function assert(
  condition: unknown,
  status: number,
  message: string,
  code?: string,
): asserts condition {
  if (!condition) throw new AppError(status, message, code);
}
