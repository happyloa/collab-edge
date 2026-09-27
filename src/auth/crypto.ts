import { timingSafeEqual } from 'node:crypto';
import { assert } from '../lib/errors';

// workerd rejects PBKDF2 calls above 100,000 iterations. The secret-side HMAC
// also prevents a D1-only leak from becoming an offline password oracle.
const iterations = 100_000;
const passwordAlgorithm = 'pbkdf2-sha256-peppered';
const encoder = new TextEncoder();
const hex = (bytes: ArrayBuffer) =>
  Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
export async function digest(value: string) {
  return hex(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
}
async function derive(password: string, salt: string, secret: string) {
  assert(secret?.length >= 32, 503, 'Session configuration unavailable');
  const keyedPassword = await sessionHash(`password-v1:${password}`, secret);
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(keyedPassword),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  return hex(
    await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: encoder.encode(salt),
        iterations,
        hash: 'SHA-256',
      },
      key,
      256,
    ),
  );
}
export async function hashPassword(password: string, secret: string) {
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)).buffer);
  return `${passwordAlgorithm}$${iterations}$${salt}$${await derive(password, salt, secret)}`;
}
export async function verifyPassword(
  password: string,
  encoded: string,
  secret: string,
) {
  const [algorithm, count, salt, expected] = encoded.split('$');
  if (
    algorithm !== passwordAlgorithm ||
    count !== String(iterations) ||
    !/^[0-9a-f]{32}$/.test(salt ?? '') ||
    !/^[0-9a-f]{64}$/.test(expected ?? '')
  )
    return false;
  const actual = await derive(password, salt, secret);
  return timingSafeEqual(encoder.encode(actual), encoder.encode(expected));
}
export async function sessionHash(token: string, secret: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return hex(await crypto.subtle.sign('HMAC', key, encoder.encode(token)));
}
