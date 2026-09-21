import { DurableObject } from 'cloudflare:workers';
import { z } from 'zod';
export class AuthRateLimiter extends DurableObject<Env> {
  consume(input: unknown) {
    const { limit, windowMs } = z
      .object({
        limit: z.number().int().min(1).max(10000),
        windowMs: z.number().int().min(1000).max(86400000),
      })
      .parse(input);
    const now = Date.now();
    this.ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS rate (id INTEGER PRIMARY KEY CHECK(id=1), start INTEGER NOT NULL, count INTEGER NOT NULL)',
    );
    const row = this.ctx.storage.sql
      .exec<{ start: number; count: number }>(
        'SELECT start,count FROM rate WHERE id=1',
      )
      .toArray()[0];
    if (!row || now - row.start >= windowMs) {
      this.ctx.storage.sql.exec(
        'INSERT INTO rate VALUES(1,?,1) ON CONFLICT(id) DO UPDATE SET start=excluded.start,count=1',
        now,
      );
      return true;
    }
    if (row.count >= limit) return false;
    this.ctx.storage.sql.exec('UPDATE rate SET count=count+1 WHERE id=1');
    return true;
  }
}
