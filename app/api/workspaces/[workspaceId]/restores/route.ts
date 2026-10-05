import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { requireUser, workspaceRole } from '../../../../../src/auth/session';
import { route, body } from '../../../../../src/lib/http';
import {
  startRestore,
  startRestoreSchema,
  workspaceRestoreStatus,
} from '../../../../../src/backups/restore-http';
const id = (request: Request) =>
  z.uuid().parse(new URL(request.url).pathname.split('/').at(-2));
export const GET = route(async (request) => {
  const user = await requireUser(request);
  return Response.json({
    job: await workspaceRestoreStatus(env.DB, id(request), user.id),
  });
});
export const POST = route(async (request) => {
  const user = await requireUser(request),
    workspaceId = id(request);
  await workspaceRole(user.id, workspaceId, false, true);
  return Response.json(
    await startRestore(
      env.DB,
      workspaceId,
      user.id,
      await body(request, startRestoreSchema),
    ),
    { status: 201 },
  );
});
