import { env } from 'cloudflare:workers';
import { drizzle } from 'drizzle-orm/d1';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { workspaces, boards, members, users } from '../../../../src/db/schema';
import { requireUser, workspaceRole } from '../../../../src/auth/session';
import { body, route } from '../../../../src/lib/http';
import { assert } from '../../../../src/lib/errors';
import { DEMO } from '../../../../src/db/demo';
import { confirmPassword } from '../../../../src/auth/reauth';
import {
  visibleTransfer,
  proposeTransfer,
  acceptTransfer,
  cancelTransfer,
} from '../../../../src/workspaces/ownership';
import {
  guardedWorkspaceWrite,
  leaveWriteGuard,
  ownerWriteGuard,
} from '../../../../src/workspaces/guarded-writes';
const workspaceId = (request: Request) =>
  z.uuid().parse(new URL(request.url).pathname.split('/').at(-1));
const demoUsers = new Set([DEMO.owner, DEMO.Alice, DEMO.Bob]);
export const GET = route(async (request) => {
  const user = await requireUser(request);
  const id = workspaceId(request);
  const role = await workspaceRole(user.id, id);
  const db = drizzle(env.DB);
  const [workspace, boardList, memberList, transfer] = await Promise.all([
    db.select().from(workspaces).where(eq(workspaces.id, id)).get(),
    db.select().from(boards).where(eq(boards.workspaceId, id)),
    db
      .select({
        userId: users.id,
        name: users.name,
        email: users.email,
        role: members.role,
      })
      .from(members)
      .innerJoin(users, eq(users.id, members.userId))
      .where(eq(members.workspaceId, id)),
    visibleTransfer(env.DB, id, user.id, role),
  ]);
  return Response.json({
    workspace,
    boards: boardList,
    members: memberList.map((member) => ({
      ...member,
      canReceiveOwnership: !demoUsers.has(member.userId),
    })),
    role,
    transfer,
    canTransferOwnership:
      role === 'OWNER' &&
      Boolean(workspace) &&
      workspace?.id !== DEMO.workspace &&
      !demoUsers.has(user.id),
  });
});
const action = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('rename'),
    name: z.string().trim().min(1).max(80),
  }),
  z.object({
    action: z.literal('invite'),
    email: z.email().trim().toLowerCase(),
    role: z.enum(['EDITOR', 'VIEWER']),
  }),
  z.object({
    action: z.literal('role'),
    userId: z.uuid(),
    role: z.enum(['EDITOR', 'VIEWER']),
  }),
  z.object({ action: z.literal('remove'), userId: z.uuid() }),
  z.object({ action: z.literal('leave') }),
  z.object({
    action: z.literal('transfer.request'),
    userId: z.uuid(),
    password: z.string().min(1).max(128),
  }),
  z.object({
    action: z.literal('transfer.accept'),
    password: z.string().min(1).max(128),
  }),
  z.object({ action: z.literal('transfer.cancel') }),
  z.object({ action: z.literal('transfer.decline') }),
]);
export const patchFor = (workspaceEnv: Env = env) =>
  route(async (request) => {
    const user = await requireUser(request);
    const id = workspaceId(request);
    const data = await body(request, action);
    const db = drizzle(workspaceEnv.DB);
    const role = await workspaceRole(
      user.id,
      id,
      false,
      !['leave', 'transfer.accept', 'transfer.decline'].includes(data.action),
    );
    if (data.action === 'transfer.request') {
      const confirmed = await confirmPassword(
        workspaceEnv,
        request,
        user.id,
        data.password,
      );
      return Response.json({
        transfer: await proposeTransfer(
          workspaceEnv.DB,
          id,
          user.id,
          data.userId,
          confirmed,
        ),
      });
    }
    if (data.action === 'transfer.accept') {
      const confirmed = await confirmPassword(
        workspaceEnv,
        request,
        user.id,
        data.password,
      );
      await acceptTransfer(workspaceEnv.DB, id, user.id, confirmed);
      return Response.json({ ok: true });
    }
    if (
      data.action === 'transfer.cancel' ||
      data.action === 'transfer.decline'
    ) {
      await cancelTransfer(
        workspaceEnv.DB,
        id,
        user.id,
        data.action === 'transfer.cancel',
      );
      return Response.json({ ok: true });
    }
    if (data.action === 'rename')
      await guardedWorkspaceWrite(
        workspaceEnv.DB,
        ownerWriteGuard(workspaceEnv.DB, id, user.id),
        workspaceEnv.DB.prepare('UPDATE workspaces SET name=? WHERE id=?').bind(
          data.name,
          id,
        ),
      );
    if (data.action === 'invite') {
      const target = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, data.email))
        .get();
      assert(target, 404, 'This user must register first');
      const exists = await db
        .select()
        .from(members)
        .where(and(eq(members.workspaceId, id), eq(members.userId, target.id)))
        .get();
      assert(!exists, 409, 'Already a member');
      await guardedWorkspaceWrite(
        workspaceEnv.DB,
        ownerWriteGuard(workspaceEnv.DB, id, user.id, {
          userId: target.id,
          membership: 'absent',
        }),
        workspaceEnv.DB.prepare(
          'INSERT INTO workspace_members(workspace_id,user_id,role) VALUES(?,?,?)',
        ).bind(id, target.id, data.role),
      );
    }
    if (data.action === 'leave') {
      assert(role !== 'OWNER', 409, 'Owners must retain workspace ownership');
      await guardedWorkspaceWrite(
        workspaceEnv.DB,
        leaveWriteGuard(workspaceEnv.DB, id, user.id),
        workspaceEnv.DB.prepare(
          'DELETE FROM workspace_members WHERE workspace_id=? AND user_id=?',
        ).bind(id, user.id),
      );
    }
    if (data.action === 'role' || data.action === 'remove') {
      const target = await db
        .select()
        .from(members)
        .where(
          and(eq(members.workspaceId, id), eq(members.userId, data.userId)),
        )
        .get();
      assert(
        target && target.role !== 'OWNER',
        409,
        'The owner cannot be removed or demoted',
      );
      await guardedWorkspaceWrite(
        workspaceEnv.DB,
        ownerWriteGuard(workspaceEnv.DB, id, user.id, {
          userId: data.userId,
          membership: 'non-owner',
        }),
        data.action === 'role'
          ? workspaceEnv.DB.prepare(
              'UPDATE workspace_members SET role=? WHERE workspace_id=? AND user_id=?',
            ).bind(data.role, id, data.userId)
          : workspaceEnv.DB.prepare(
              'DELETE FROM workspace_members WHERE workspace_id=? AND user_id=?',
            ).bind(id, data.userId),
      );
    }
    return Response.json({ ok: true });
  });
export const PATCH = patchFor();
