import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { requireUser } from '../../../../../src/auth/session';
import { route } from '../../../../../src/lib/http';
import { workspaceUsage } from '../../../../../src/workspaces/usage';

export const GET = route(async (request) => {
  const user = await requireUser(request);
  const workspaceId = z
    .uuid()
    .parse(new URL(request.url).pathname.split('/').at(-2));
  return Response.json(
    await workspaceUsage(
      env.DB,
      workspaceId,
      user.id,
      env.ATTACHMENTS_ENABLED === 'true',
    ),
  );
});
