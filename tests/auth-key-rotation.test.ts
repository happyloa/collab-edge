import { env } from 'cloudflare:workers';
import { expect, it, vi } from 'vitest';
import { hashPassword, sessionHash } from '../src/auth/crypto';
import { checkPassword, newPasswordHash } from '../src/auth/password';
import { authenticate } from '../src/auth/routes';
import {
  currentUserForToken,
  prepareSession,
  sessionIdForToken,
  tokenFrom,
} from '../src/auth/session';

const password = 'A-secret-rotation-password-2026';
const currentPepper = 'first-password-pepper-with-32-or-more-characters';
const nextPepper = 'second-password-pepper-with-32-or-more-characters';
const first: Env = {
  ...env,
  PASSWORD_PEPPER_ID: 'old',
  PASSWORD_PEPPERS: JSON.stringify({ old: currentPepper }),
};
const next: Env = {
  ...first,
  PASSWORD_PEPPER_ID: 'next',
  PASSWORD_PEPPERS: JSON.stringify({ old: currentPepper, next: nextPepper }),
};

function login(email: string) {
  return new Request('https://rotation.test/api/auth/login', {
    method: 'POST',
    headers: {
      Origin: 'https://rotation.test',
      'Content-Type': 'application/json',
      'CF-Connecting-IP': '192.0.2.201',
    },
    body: JSON.stringify({ email, password }),
  });
}

async function account(hash: string) {
  const id = crypto.randomUUID();
  const email = `rotation-${id}@example.com`;
  await env.DB.prepare(
    'INSERT INTO users(id,email,name,password,created_at) VALUES(?,?,?,?,0)',
  )
    .bind(id, email, 'Rotation user', hash)
    .run();
  return { id, email };
}

it('rotates session signing independently of current and legacy passwords', async () => {
  const legacy = await hashPassword(password, env.SESSION_SECRET);
  const current = await newPasswordHash(password, first);
  const user = await account(current);
  const prepared = await prepareSession(user.id, login(user.email), first);
  await env.DB.prepare(
    'INSERT INTO sessions(id,user_id,expires_at) VALUES(?,?,?)',
  )
    .bind(prepared.row.id, user.id, prepared.row.expiresAt)
    .run();
  const token = tokenFrom(
    new Request('https://rotation.test', {
      headers: { Cookie: prepared.cookie },
    }),
  )!;
  expect(token).toMatch(/^ce2\./);
  expect(await currentUserForToken(token, first)).toMatchObject({
    id: user.id,
  });
  const rotated = {
    ...first,
    SESSION_SIGNING_KEY: 'rotated-independent-session-signing-key-2026',
  };
  expect(await currentUserForToken(token, rotated)).toBeNull();
  expect(await checkPassword(password, current, rotated)).toEqual({
    valid: true,
    needsUpgrade: false,
  });
  expect(await checkPassword(password, legacy, rotated)).toEqual({
    valid: true,
    needsUpgrade: true,
  });
  const signedIn = await authenticate(false, rotated)(login(user.email));
  expect(signedIn.status).toBe(200);
  const fresh = tokenFrom(
    new Request('https://rotation.test', {
      headers: { Cookie: signedIn.headers.get('set-cookie')! },
    }),
  )!;
  expect(await currentUserForToken(fresh, rotated)).toMatchObject({
    id: user.id,
  });
  expect(await currentUserForToken(fresh, first)).toBeNull();
});

it('upgrades legacy and previous-pepper hashes only after a successful sign-in', async () => {
  for (const hash of [
    await hashPassword(password, env.SESSION_SECRET),
    await newPasswordHash(password, first),
  ]) {
    const user = await account(hash);
    const wrong = login(user.email);
    const failed = await authenticate(
      false,
      next,
    )(
      new Request(wrong.url, {
        method: 'POST',
        headers: wrong.headers,
        body: JSON.stringify({
          email: user.email,
          password: 'a-wrong-but-long-enough-password',
        }),
      }),
    );
    expect(failed.status).toBe(401);
    expect(
      await env.DB.prepare('SELECT password FROM users WHERE id=?')
        .bind(user.id)
        .first(),
    ).toEqual({ password: hash });
    const result = await authenticate(false, next)(login(user.email));
    expect(result.status).toBe(200);
    const row = await env.DB.prepare('SELECT password FROM users WHERE id=?')
      .bind(user.id)
      .first<{ password: string }>();
    expect(row!.password).toMatch(/^pbkdf2-sha256-peppered-v2\$100000\$next\$/);
    const retired = {
      ...next,
      PASSWORD_PEPPERS: JSON.stringify({ next: nextPepper }),
    };
    expect(await checkPassword(password, row!.password, retired)).toEqual({
      valid: true,
      needsUpgrade: false,
    });
  }
});

it('fails closed for missing, malformed or retired password keys without leaking them', async () => {
  const hash = await newPasswordHash(password, first);
  for (const peppers of [
    'not-json',
    '{}',
    JSON.stringify({ old: 'short' }),
    JSON.stringify({ next: nextPepper }),
  ]) {
    await expect(
      checkPassword(password, hash, { ...first, PASSWORD_PEPPERS: peppers }),
    ).rejects.toThrow('Password configuration unavailable');
  }
  const retired = {
    ...next,
    PASSWORD_PEPPERS: JSON.stringify({ next: nextPepper }),
  };
  await expect(checkPassword(password, hash, retired)).rejects.toThrow(
    'Password configuration unavailable',
  );
  expect(await checkPassword(password, `${hash}$extra`, first)).toEqual({
    valid: false,
    needsUpgrade: false,
  });
  expect(
    await checkPassword(
      password,
      hash.replace('$100000$', '$999999999$'),
      first,
    ),
  ).toEqual({ valid: false, needsUpgrade: false });
});

it('ends legacy session acceptance at a fixed grace deadline and rejects malformed tokens', async () => {
  const token = `${crypto.randomUUID()}${crypto.randomUUID()}`;
  const user = await account(await newPasswordHash(password, first));
  const id = await sessionHash(token, first.SESSION_SECRET);
  await env.DB.prepare(
    'INSERT INTO sessions(id,user_id,expires_at) VALUES(?,?,?)',
  )
    .bind(id, user.id, Date.now() + 60000)
    .run();
  const grace = {
    ...first,
    LEGACY_SESSIONS_UNTIL: new Date(Date.now() + 60000).toISOString(),
  };
  expect(await currentUserForToken(token, grace)).toMatchObject({
    id: user.id,
  });
  expect(
    await currentUserForToken(token, {
      ...grace,
      LEGACY_SESSIONS_UNTIL: new Date(Date.now() - 1).toISOString(),
    }),
  ).toBeNull();
  expect(
    await currentUserForToken(token, { ...grace, LEGACY_SESSIONS_UNTIL: '' }),
  ).toBeNull();
  expect(await sessionIdForToken('ce2.'.repeat(100), first)).toBeNull();
  expect(await sessionIdForToken('ce2.not-a-session', first)).toBeNull();
  await expect(
    prepareSession(user.id, login(user.email), {
      ...first,
      SESSION_SIGNING_KEY: '',
    }),
  ).rejects.toThrow('Session configuration unavailable');
});

it('rolls back a password upgrade and session if the sign-in transaction fails', async () => {
  const legacy = await hashPassword(password, env.SESSION_SECRET);
  const user = await account(legacy);
  await env.DB.prepare(
    `CREATE TRIGGER fail_upgrade_session BEFORE INSERT ON sessions WHEN NEW.user_id='${user.id}' BEGIN SELECT RAISE(ABORT,'Test session failure'); END;`,
  ).run();
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    const result = await authenticate(false, first)(login(user.email));
    expect(result.status).toBe(500);
    expect(result.headers.get('set-cookie')).toBeNull();
    expect(
      await env.DB.prepare('SELECT password FROM users WHERE id=?')
        .bind(user.id)
        .first(),
    ).toEqual({ password: legacy });
    expect(
      await env.DB.prepare(
        'SELECT count(*) AS count FROM sessions WHERE user_id=?',
      )
        .bind(user.id)
        .first(),
    ).toEqual({ count: 0 });
    expect(log.mock.calls.flat().join('')).not.toContain(user.email);
  } finally {
    await env.DB.exec('DROP TRIGGER fail_upgrade_session');
    log.mockRestore();
  }
});

it('does not overwrite a password reset that races with login verification', async () => {
  const legacy = await hashPassword(password, env.SESSION_SECRET);
  const user = await account(legacy);
  const replacement = await newPasswordHash(
    'A-new-password-after-the-reset-2026',
    first,
  );
  let changed = false;
  const racing: Env = {
    ...first,
    DB: new Proxy(env.DB, {
      get(target, property) {
        if (property === 'batch')
          return async (statements: D1PreparedStatement[]) => {
            if (!changed) {
              changed = true;
              await env.DB.prepare('UPDATE users SET password=? WHERE id=?')
                .bind(replacement, user.id)
                .run();
            }
            return target.batch(statements);
          };
        const value = Reflect.get(target, property, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    }),
  };
  const result = await authenticate(false, racing)(login(user.email));
  expect(result.status).toBe(409);
  expect(result.headers.get('set-cookie')).toBeNull();
  expect(
    await env.DB.prepare('SELECT password FROM users WHERE id=?')
      .bind(user.id)
      .first(),
  ).toEqual({ password: replacement });
  expect(
    await env.DB.prepare(
      'SELECT count(*) AS count FROM sessions WHERE user_id=?',
    )
      .bind(user.id)
      .first(),
  ).toEqual({ count: 0 });
});
