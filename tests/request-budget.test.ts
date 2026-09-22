import { env } from 'cloudflare:workers';
import { runInDurableObject, evictDurableObject } from 'cloudflare:test';
import { it, expect, vi } from 'vitest';
import { requestBudget } from '../src/lib/request-budget';

it('limits each source before touching the persistent budget', async () => {
  const limit = vi.fn().mockResolvedValue({ success: false });
  const response = await requestBudget(
    new Request('https://test.dev/api/auth/demo', {
      headers: { 'CF-Connecting-IP': '192.0.2.1' },
    }),
    { ...env, REQUEST_LIMITER: { limit } },
  );
  expect(response?.status).toBe(429);
  expect(response?.headers.get('Retry-After')).toBe('60');
  expect(limit).toHaveBeenCalledWith({ key: '192.0.2.1' });
});
it('blocks requests once the global persistent budget is exhausted', async () => {
  const budget = env.AUTH_LIMITER.getByName('site-requests-daily-v1');
  await budget.consume({ limit: 5000, windowMs: 86400000 });
  await runInDurableObject(budget, (_instance, state) => {
    state.storage.sql.exec('UPDATE rate SET count=4999 WHERE id=1');
  });
  const request = new Request('https://test.dev/realtime/test');
  const budgetEnv = {
    ...env,
    REQUEST_LIMITER: { limit: async () => ({ success: true }) },
  };
  expect(await requestBudget(request, budgetEnv)).toBeNull();
  await evictDurableObject(budget);
  const response = await requestBudget(request, budgetEnv);
  expect(response?.status).toBe(429);
  expect(await response?.text()).toContain('daily usage limit');
  await runInDurableObject(budget, (_instance, state) => {
    state.storage.sql.exec(
      'UPDATE rate SET start=? WHERE id=1',
      Date.now() - 86400001,
    );
  });
  expect(await requestBudget(request, budgetEnv)).toBeNull();
});
it('fails closed if the limiter fails', async () => {
  const response = await requestBudget(new Request('https://test.dev/'), {
    ...env,
    REQUEST_LIMITER: {
      limit: async () => {
        throw new Error('Unavailable');
      },
    },
  });
  expect(response?.status).toBe(503);
});
