const iterations = 600_000;
const encoder = new TextEncoder();
const hex = (bytes: ArrayBuffer) =>
  Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
export async function digest(value: string) {
  return hex(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
}
async function derive(password: string, salt: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
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
export async function hashPassword(password: string) {
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)).buffer);
  return `pbkdf2-sha256$${iterations}$${salt}$${await derive(password, salt)}`;
}
export async function verifyPassword(password: string, encoded: string) {
  const [algorithm, count, salt, expected] = encoded.split('$');
  if (
    algorithm !== 'pbkdf2-sha256' ||
    count !== String(iterations) ||
    !salt ||
    expected?.length !== 64
  )
    return false;
  const actual = await derive(password, salt);
  let difference = 0;
  for (let i = 0; i < actual.length; i++)
    difference |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return difference === 0;
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
