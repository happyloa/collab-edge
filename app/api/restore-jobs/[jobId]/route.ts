import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { requireUser } from '../../../../src/auth/session';
import { body, route } from '../../../../src/lib/http';
import {
  authorizedRestoreJob,
  restoreStatus,
} from '../../../../src/backups/restore';
import { provenRowSchema } from '../../../../src/backups/transfer';
import { BACKUP_LIMITS } from '../../../../src/backups/format';
import { unwrapRestore } from '../../../../src/backups/restore-http';
const id = (request: Request) =>
  z.uuid().parse(new URL(request.url).pathname.split('/').at(-1));
export const GET = route(async (request) => {
  const user = await requireUser(request);
  return Response.json(await restoreStatus(env.DB, id(request), user.id));
});
export const PATCH = route(async (request) => {
  const user = await requireUser(request),
    jobId = id(request);
  const job = await authorizedRestoreJob(env.DB, jobId, user.id);
  const data = await body(
    request,
    z
      .object({
        items: z.array(provenRowSchema).min(1).max(BACKUP_LIMITS.chunkItems),
      })
      .strict(),
  );
  return Response.json(
    unwrapRestore(
      await env.BOARD_ROOMS.getByName(job.target_board_id).restoreUpload(
        jobId,
        user.id,
        data.items,
      ),
    ),
  );
});
export const POST = route(async (request) => {
  const user = await requireUser(request),
    jobId = id(request);
  const job = await authorizedRestoreJob(env.DB, jobId, user.id);
  const action = await body(
    request,
    z.object({ action: z.enum(['complete', 'cleanup']) }).strict(),
  );
  const room = env.BOARD_ROOMS.getByName(job.target_board_id);
  return Response.json(
    action.action === 'complete'
      ? unwrapRestore(await room.restoreComplete(jobId, user.id))
      : unwrapRestore(await room.restoreClean(jobId, user.id)),
  );
});
export const DELETE = route(async (request) => {
  const user = await requireUser(request),
    jobId = id(request);
  const job = await authorizedRestoreJob(env.DB, jobId, user.id);
  return Response.json(
    unwrapRestore(
      await env.BOARD_ROOMS.getByName(job.target_board_id).restoreCancel(
        jobId,
        user.id,
      ),
    ),
  );
});
