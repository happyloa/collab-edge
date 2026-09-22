import handler from 'vinext/server/fetch-handler';
import { requestBudget } from '../src/lib/request-budget';
import { requireAccess } from '../src/auth/access';
export { BoardRoom } from './durable-objects/BoardRoom';
export { AuthRateLimiter } from './durable-objects/AuthRateLimiter';
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const unauthorized = await requireAccess(request, env);
    if (unauthorized) return unauthorized;
    const blocked = await requestBudget(request, env);
    if (blocked) return blocked;
    const match = new URL(request.url).pathname.match(
      /^\/realtime\/([0-9a-f-]{36})$/i,
    );
    if (match)
      return env.BOARD_ROOMS.get(env.BOARD_ROOMS.idFromName(match[1])).fetch(
        request,
      );
    return handler.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
