import handler from 'vinext/server/fetch-handler';
import { requestBudget } from '../src/lib/request-budget';
import { requireAccess } from '../src/auth/access';
import { withSecurityHeaders } from '../src/lib/security-headers';
export { BoardRoom } from './durable-objects/BoardRoom';
export { AuthRateLimiter } from './durable-objects/AuthRateLimiter';
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const unauthorized = await requireAccess(request, env);
    if (unauthorized) return withSecurityHeaders(unauthorized, request);
    const blocked = await requestBudget(request, env);
    if (blocked) return withSecurityHeaders(blocked, request);
    const match = new URL(request.url).pathname.match(
      /^\/realtime\/([0-9a-f-]{36})$/i,
    );
    if (match)
      return withSecurityHeaders(
        await env.BOARD_ROOMS.get(env.BOARD_ROOMS.idFromName(match[1])).fetch(
          request,
        ),
        request,
      );
    return withSecurityHeaders(await handler.fetch(request, env, ctx), request);
  },
} satisfies ExportedHandler<Env>;
