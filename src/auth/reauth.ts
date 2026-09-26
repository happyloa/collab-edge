import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { users } from '../db/schema';
import { assert } from '../lib/errors';
import { verifyPassword } from './crypto';

/** Require the account password again before sensitive account changes. */
export async function confirmPassword(
  authEnv: Env,
  userId: string,
  password: string,
) {
  assert(
    await authEnv.AUTH_LIMITER.getByName(`reauth-password:${userId}`).consume({
      limit: 5,
      windowMs: 60_000,
    }),
    429,
    'Too many password confirmations. Try again later.',
  );
  const user = await drizzle(authEnv.DB)
    .select({ password: users.password })
    .from(users)
    .where(eq(users.id, userId))
    .get();
  assert(
    user && (await verifyPassword(password, user.password)),
    401,
    'Incorrect password',
  );
  return user.password;
}
