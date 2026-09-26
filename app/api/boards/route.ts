import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { requireUser, workspaceRole } from '../../../src/auth/session';
import { body, route } from '../../../src/lib/http';
import {
  guardedWorkspaceWrite,
  memberWriteGuard,
} from '../../../src/workspaces/guarded-writes';

export const createBoardFor = (boardEnv: Env = env) =>
  route(async (request) => {
    const user = await requireUser(request);
    const data = await body(
      request,
      z.object({
        workspaceId: z.uuid(),
        name: z.string().trim().min(1).max(80),
      }),
    );
    await workspaceRole(user.id, data.workspaceId, true);
    const id = crypto.randomUUID();
    const binding = boardEnv.DB;
    const initialColumns = ['Backlog', 'In Progress', 'Review', 'Done'];
    await guardedWorkspaceWrite(
      binding,
      memberWriteGuard(binding, data.workspaceId, user.id),
      [
        binding
          .prepare('INSERT INTO boards(id,workspace_id,name) VALUES(?,?,?)')
          .bind(id, data.workspaceId, data.name),
        binding
          .prepare(
            `INSERT INTO board_columns(id,board_id,title,position,updated_revision,title_revision)
           VALUES ${initialColumns.map(() => '(?,?,?,?,?,?)').join(',')}`,
          )
          .bind(
            ...initialColumns.flatMap((title, position) => [
              crypto.randomUUID(),
              id,
              title,
              position,
              0,
              0,
            ]),
          ),
      ],
    );
    return Response.json({ id }, { status: 201 });
  });
export const POST = createBoardFor();
