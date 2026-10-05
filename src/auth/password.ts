import { z } from 'zod';
import { assert } from '../lib/errors';
import { hashPassword, passwordHashVersion, verifyPassword } from './crypto';

const keyring = z
  .record(
    z.string().regex(/^[a-zA-Z0-9_-]{1,16}$/),
    z.string().min(32).max(256),
  )
  .refine(
    (keys) => Object.keys(keys).length >= 1 && Object.keys(keys).length <= 4,
  );

function passwordKeys(authEnv: Env) {
  let raw: unknown;
  try {
    assert(
      authEnv.PASSWORD_PEPPERS?.length <= 4096,
      503,
      'Password configuration unavailable',
    );
    raw = JSON.parse(authEnv.PASSWORD_PEPPERS);
  } catch {
    assert(false, 503, 'Password configuration unavailable');
  }
  const parsed = keyring.safeParse(raw);
  assert(parsed.success, 503, 'Password configuration unavailable');
  assert(
    /^[a-zA-Z0-9_-]{1,16}$/.test(authEnv.PASSWORD_PEPPER_ID) &&
      Object.hasOwn(parsed.data, authEnv.PASSWORD_PEPPER_ID),
    503,
    'Password configuration unavailable',
  );
  return { peppers: parsed.data, current: authEnv.PASSWORD_PEPPER_ID };
}

export async function newPasswordHash(password: string, authEnv: Env) {
  const { peppers, current } = passwordKeys(authEnv);
  return hashPassword(password, peppers[current], current);
}

export function dummyPasswordHash(authEnv: Env) {
  const { current } = passwordKeys(authEnv);
  return `pbkdf2-sha256-peppered-v2$100000$${current}$${'0'.repeat(32)}$${'0'.repeat(64)}`;
}

export async function checkPassword(
  password: string,
  encoded: string,
  authEnv: Env,
) {
  const { peppers, current } = passwordKeys(authEnv);
  const version = passwordHashVersion(encoded);
  if (version === undefined) return { valid: false, needsUpgrade: false };
  // SESSION_SECRET is frozen for old hashes and the bounded legacy-session grace.
  // New passwords and sessions use their own independent secrets.
  const pepper = version === null ? authEnv.SESSION_SECRET : peppers[version];
  assert(pepper?.length >= 32, 503, 'Password configuration unavailable');
  const valid = await verifyPassword(password, encoded, pepper);
  return { valid, needsUpgrade: valid && version !== current };
}
