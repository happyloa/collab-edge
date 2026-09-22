import { env } from 'cloudflare:workers';
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
  for (let i = 0; i < 5000; i++)
    await budget.consume({ limit: 5000, windowMs: 86400000 });
  const response = await requestBudget(
    new Request('https://test.dev/realtime/test'),
    { ...env, REQUEST_LIMITER: { limit: async () => ({ success: true }) } },
  );
  expect(response?.status).toBe(429);
  expect(await response?.text()).toContain('daily usage limit');
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
