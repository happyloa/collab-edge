import { DurableObject } from 'cloudflare:workers';
import { z } from 'zod';
import { drizzle } from 'drizzle-orm/d1';
import { and, eq, gt, asc } from 'drizzle-orm';
import { boards, events } from '../../src/db/schema';
import { currentUser, boardAccess, tokenFrom } from '../../src/auth/session';
import { sessionHash } from '../../src/auth/crypto';
import { loadSnapshot } from '../../src/db/queries/snapshot';
import { DEMO } from '../../src/db/demo';
import {
  clientMessage,
  mutationSchema,
  eventSchema,
  type Mutation,
  type BoardEvent,
  type ServerMessage,
  type Presence,
} from '../../src/realtime/protocol';
import { prepareMutation, ConflictError } from '../../src/realtime/mutations';
import { AppError, assert } from '../../src/lib/errors';
import { LIMITS } from '../../src/lib/limits';
import { uploadMetadata, validateBytes } from '../../src/validation/uploads';

const socketState = z.object({
  boardId: z.uuid(),
  cookie: z.string(),
  origin: z.url(),
  presence: z.object({
    userId: z.uuid(),
    displayName: z.string(),
    status: z.enum(['active', 'idle']),
    selectedCardId: z.uuid().optional(),
  }),
  window: z.number(),
  messages: z.number(),
});
export class BoardRoom extends DurableObject<Env> {
  private queue: Promise<unknown> = Promise.resolve();
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.queue.then(fn);
    this.queue = result.catch(() => undefined);
    return result;
  }
  async fetch(request: Request) {
    return this.serial(async () => {
      try {
        const boardId = z
          .uuid()
          .parse(new URL(request.url).pathname.split('/').at(-1));
        assert(
          request.headers.get('upgrade')?.toLowerCase() === 'websocket',
          426,
          'WebSocket required',
        );
        assert(
          request.headers.get('origin') === new URL(request.url).origin,
          403,
          'Invalid origin',
        );
        const user = await currentUser(request);
        assert(user, 401, 'Please sign in');
        const { board, role } = await boardAccess(user.id, boardId);
        assert(
          this.ctx.getWebSockets().length < LIMITS.socketsPerBoard,
          429,
          'Board connection limit reached',
        );
        const pair = new WebSocketPair();
        const [client, server] = Object.values(pair);
        this.ctx.acceptWebSocket(server);
        server.serializeAttachment({
          boardId,
          cookie: request.headers.get('cookie') ?? '',
          origin: new URL(request.url).origin,
          presence: {
            userId: user.id,
            displayName: user.name,
            status: 'active',
          },
          window: Date.now(),
          messages: 0,
        });
        this.send(server, {
          type: 'ready',
          revision: board.revision,
          role,
          userId: user.id,
        });
        await this.broadcastPresence(boardId);
        return new Response(null, { status: 101, webSocket: client });
      } catch (error) {
        return Response.json(
          {
            error: error instanceof Error ? error.message : 'Connection failed',
          },
          { status: error instanceof AppError ? error.status : 400 },
        );
      }
    });
  }
  async snapshot(boardId: string, userId: string) {
    return this.serial(async () => {
      await boardAccess(userId, boardId);
      return loadSnapshot(this.env.DB, boardId);
    });
  }
  async upload(
    boardId: string,
    userId: string,
    cardId: string,
    metadata: unknown,
    bytes: ArrayBuffer,
  ) {
    return this.serial(async () => {
      assert(
        this.env.ATTACHMENTS_ENABLED === 'true',
        403,
        'Attachments are disabled in this cost-limited environment',
      );
      const data = uploadMetadata.parse(metadata);
      assert(bytes.byteLength === data.size, 400, 'Invalid file size');
      validateBytes(bytes, data.mime);
      await boardAccess(userId, boardId, true);
      const state = await loadSnapshot(this.env.DB, boardId);
      assert(!state.board.archived, 410, 'This board is archived');
      assert(
        state.cards.some((c) => c.id === cardId && !c.archived),
        404,
        'Card not found',
      );
      assert(
        state.attachments.filter((a) => a.cardId === cardId).length <
          LIMITS.attachmentsPerCard,
        429,
        'Attachment limit reached',
      );
      assert(
        state.board.revision < LIMITS.eventsPerBoard,
        429,
        'Board quota reached',
      );
      assert(
        await this.env.AUTH_LIMITER.getByName('r2-operations').consume({
          limit: 1000,
          windowMs: 86400000,
        }),
        429,
        'Daily attachment operation limit reached',
      );
      // Lifetime byte reservations are never refunded, even after crashes or failed
      // uploads. This conservative bound cannot be bypassed with retry races.
      await this.env.DB.batch([
        this.env.DB.prepare(
          "INSERT INTO quotas(key,used) VALUES('upload-bytes',?) ON CONFLICT(key) DO UPDATE SET used=used+excluded.used",
        ).bind(data.size),
        this.env.DB.prepare(
          "INSERT INTO mutation_guard(value) SELECT CASE WHEN used<=? THEN 1 ELSE 0 END FROM quotas WHERE key='upload-bytes'",
        ).bind(LIMITS.totalAttachmentBytes),
        this.env.DB.prepare('DELETE FROM mutation_guard'),
      ]);
      const id = crypto.randomUUID();
      const objectKey = `${boardId}/${id}`;
      const createdAt = new Date().toISOString();
      await this.env.ATTACHMENTS.put(objectKey, bytes, {
        httpMetadata: { contentType: data.mime },
      });
      const attachment = {
        id,
        cardId,
        boardId,
        ...data,
        actorId: userId,
        createdAt,
      };
      const event: BoardEvent = {
        eventId: crypto.randomUUID(),
        clientMutationId: id,
        boardId,
        actorId: userId,
        revision: state.board.revision + 1,
        type: 'attachment.create',
        payload: { attachments: [attachment] },
        createdAt,
      };
      try {
        await this.commitAttachment(event, [
          this.env.DB.prepare(
            'INSERT INTO attachments(id,card_id,board_id,object_key,filename,mime,size,actor_id,created_at) VALUES(?,?,?,?,?,?,?,?,?)',
          ).bind(
            id,
            cardId,
            boardId,
            objectKey,
            data.filename,
            data.mime,
            data.size,
            userId,
            createdAt,
          ),
        ]);
      } catch (error) {
        await this.env.ATTACHMENTS.delete(objectKey);
        throw error;
      }
      await this.broadcastEvent(event);
      return { id };
    });
  }
  async removeAttachment(
    boardId: string,
    userId: string,
    attachmentId: string,
  ) {
    return this.serial(async () => {
      assert(
        this.env.ATTACHMENTS_ENABLED === 'true',
        403,
        'Attachments are disabled in this cost-limited environment',
      );
      await boardAccess(userId, boardId, true);
      const state = await loadSnapshot(this.env.DB, boardId);
      const attachment = await this.env.DB.prepare(
        'SELECT object_key FROM attachments WHERE id=? AND board_id=?',
      )
        .bind(attachmentId, boardId)
        .first<{ object_key: string }>();
      if (!attachment) return { ok: true };
      assert(!state.board.archived, 410, 'This board is archived');
      assert(
        state.board.revision < LIMITS.eventsPerBoard,
        429,
        'Board quota reached',
      );
      const event: BoardEvent = {
        eventId: crypto.randomUUID(),
        clientMutationId: crypto.randomUUID(),
        boardId,
        actorId: userId,
        revision: state.board.revision + 1,
        type: 'attachment.remove',
        payload: { removedAttachments: [attachmentId] },
        createdAt: new Date().toISOString(),
      };
      await this.commitAttachment(event, [
        this.env.DB.prepare('DELETE FROM attachments WHERE id=?').bind(
          attachmentId,
        ),
      ]);
      await this.env.ATTACHMENTS.delete(attachment.object_key);
      await this.broadcastEvent(event);
      return { ok: true };
    });
  }
  private async commitAttachment(
    event: BoardEvent,
    statements: D1PreparedStatement[],
  ) {
    await this.env.DB.batch([
      this.env.DB.prepare(
        'INSERT INTO mutation_guard(value) SELECT CASE WHEN revision=? THEN 1 ELSE 0 END FROM boards WHERE id=?',
      ).bind(event.revision - 1, event.boardId),
      ...statements,
      this.env.DB.prepare('UPDATE boards SET revision=? WHERE id=?').bind(
        event.revision,
        event.boardId,
      ),
      this.env.DB.prepare(
        'INSERT INTO board_events(event_id,board_id,revision,client_mutation_id,actor_id,type,payload,created_at) VALUES(?,?,?,?,?,?,?,?)',
      ).bind(
        event.eventId,
        event.boardId,
        event.revision,
        event.clientMutationId,
        event.actorId,
        event.type,
        JSON.stringify(event.payload),
        event.createdAt,
      ),
      this.env.DB.prepare('DELETE FROM mutation_guard'),
    ]);
  }
  async webSocketMessage(socket: WebSocket, raw: string | ArrayBuffer) {
    return this.serial(async () => {
      let mutationId: string | undefined;
      try {
        assert(
          typeof raw === 'string' &&
            new TextEncoder().encode(raw).length <= LIMITS.requestBytes,
          413,
          'Message too large',
        );
        const state = socketState.parse(socket.deserializeAttachment());
        if (Date.now() - state.window > 60_000) {
          state.window = Date.now();
          state.messages = 0;
        }
        state.messages++;
        socket.serializeAttachment(state);
        assert(
          state.messages <= LIMITS.messagesPerMinute,
          429,
          'Message rate limit reached',
        );
        const message = clientMessage.parse(JSON.parse(raw));
        const request = new Request(state.origin, {
          headers: { cookie: state.cookie },
        });
        const user = await currentUser(request);
        assert(user, 401, 'Session expired');
        await boardAccess(user.id, state.boardId, message.type === 'mutate');
        if (message.type === 'resync')
          await this.replay(socket, state.boardId, message.lastSeenRevision);
        if (message.type === 'ping') this.send(socket, { type: 'pong' });
        if (message.type === 'presence') {
          state.presence = {
            userId: user.id,
            displayName: user.name,
            status: message.status,
            selectedCardId: message.selectedCardId,
          };
          socket.serializeAttachment(state);
          await this.broadcastPresence(state.boardId);
        }
        if (message.type === 'mutate') {
          mutationId = message.mutation.clientMutationId;
          try {
            const event = await this.mutate(
              state.boardId,
              user.id,
              message.mutation,
            );
            await this.broadcastEvent(event);
            this.send(socket, {
              type: 'ack',
              revision: event.revision,
              clientMutationId: mutationId,
            });
          } catch (error) {
            if (!(error instanceof ConflictError)) throw error;
            const snapshot = await loadSnapshot(this.env.DB, state.boardId);
            this.send(socket, {
              type: 'conflict',
              clientMutationId: mutationId,
              serverRevision: snapshot.board.revision,
              reason: error.message,
              snapshot,
            });
          }
        }
      } catch (error) {
        this.send(socket, {
          type: 'error',
          clientMutationId: mutationId,
          message:
            error instanceof AppError
              ? error.message
              : 'Invalid message or unavailable service',
        });
        if (error instanceof AppError && [401, 403].includes(error.status))
          socket.close(1008, 'Access expired');
      }
    });
  }
  private async mutate(
    boardId: string,
    actorId: string,
    input: Mutation,
  ): Promise<BoardEvent> {
    const mutation = mutationSchema.parse(input);
    assert(
      boardId !== DEMO.board || mutation.command.type !== 'board.archive',
      403,
      'The shared demo board cannot be archived',
    );
    const db = drizzle(this.env.DB);
    const duplicate = await db
      .select()
      .from(events)
      .where(
        and(
          eq(events.boardId, boardId),
          eq(events.clientMutationId, mutation.clientMutationId),
        ),
      )
      .get();
    if (duplicate) {
      assert(
        duplicate.actorId === actorId,
        409,
        'Mutation ID belongs to another actor',
      );
      return eventSchema.parse({
        ...duplicate,
        payload: JSON.parse(duplicate.payload),
      });
    }
    const state = await loadSnapshot(this.env.DB, boardId);
    assert(
      state.board.revision < LIMITS.eventsPerBoard,
      429,
      'Demo board mutation quota reached',
    );
    const patch = prepareMutation(state, mutation, actorId);
    const assignment =
      mutation.command.type === 'card.update'
        ? mutation.command.payload.assigneeId
        : undefined;
    if (assignment) {
      const member = await this.env.DB.prepare(
        'SELECT 1 FROM workspace_members WHERE workspace_id=? AND user_id=?',
      )
        .bind(state.board.workspaceId, assignment)
        .first();
      assert(member, 400, 'Assignee must be a current workspace member');
    }
    const event: BoardEvent = {
      boardId,
      revision: state.board.revision + 1,
      eventId: crypto.randomUUID(),
      clientMutationId: mutation.clientMutationId,
      actorId,
      type: mutation.command.type,
      payload: patch,
      createdAt: new Date().toISOString(),
    };
    const statements: D1PreparedStatement[] = [];
    if (assignment)
      statements.push(
        this.env.DB.prepare(
          'INSERT INTO mutation_guard(value) SELECT CASE WHEN EXISTS(SELECT 1 FROM workspace_members WHERE workspace_id=? AND user_id=?) THEN 1 ELSE 0 END',
        ).bind(state.board.workspaceId, assignment),
      );
    if (patch.board)
      statements.push(
        this.env.DB.prepare(
          'UPDATE boards SET name=?,name_revision=?,archived=? WHERE id=?',
        ).bind(
          patch.board.name,
          patch.board.nameRevision,
          Number(patch.board.archived),
          boardId,
        ),
      );
    for (const col of patch.columns ?? [])
      statements.push(
        this.env.DB.prepare(
          'INSERT INTO board_columns(id,board_id,title,position,updated_revision,title_revision) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,position=excluded.position,updated_revision=excluded.updated_revision,title_revision=excluded.title_revision',
        ).bind(
          col.id,
          boardId,
          col.title,
          col.position,
          col.updatedRevision,
          col.titleRevision,
        ),
      );
    if (mutation.command.type === 'card.move' && patch.cards?.length) {
      // One statement keeps large reorders below the Workers Free D1 query cap.
      const positions = patch.cards.map(({ id, columnId, position }) => ({
        id,
        columnId,
        position,
      }));
      statements.push(
        this.env.DB.prepare(
          `WITH moved AS (
            SELECT json_extract(value, '$.id') AS id,
                   json_extract(value, '$.columnId') AS column_id,
                   CAST(json_extract(value, '$.position') AS INTEGER) AS position
            FROM json_each(?)
          )
          UPDATE cards
          SET column_id = (SELECT column_id FROM moved WHERE moved.id = cards.id),
              position = (SELECT position FROM moved WHERE moved.id = cards.id),
              updated_revision = ?
          WHERE board_id = ? AND id IN (SELECT id FROM moved)`,
        ).bind(JSON.stringify(positions), event.revision, boardId),
      );
    } else {
      for (const card of patch.cards ?? [])
        statements.push(
          this.env.DB.prepare(
            'INSERT INTO cards(id,board_id,column_id,title,description,position,archived,updated_revision,title_revision,description_revision,assignee_id,due_date,assignee_revision,due_date_revision) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET column_id=excluded.column_id,title=excluded.title,description=excluded.description,position=excluded.position,archived=excluded.archived,updated_revision=excluded.updated_revision,title_revision=excluded.title_revision,description_revision=excluded.description_revision,assignee_id=excluded.assignee_id,due_date=excluded.due_date,assignee_revision=excluded.assignee_revision,due_date_revision=excluded.due_date_revision',
          ).bind(
            card.id,
            boardId,
            card.columnId,
            card.title,
            card.description,
            card.position,
            Number(card.archived),
            card.updatedRevision,
            card.titleRevision,
            card.descriptionRevision,
            card.assigneeId,
            card.dueDate,
            card.assigneeRevision,
            card.dueDateRevision,
          ),
        );
    }
    for (const comment of patch.comments ?? [])
      statements.push(
        this.env.DB.prepare(
          'INSERT INTO card_comments(id,card_id,board_id,actor_id,body,created_at) VALUES(?,?,?,?,?,?)',
        ).bind(
          comment.id,
          comment.cardId,
          boardId,
          actorId,
          comment.body,
          comment.createdAt,
        ),
      );
    for (const id of patch.removedColumns ?? [])
      statements.push(
        this.env.DB.prepare(
          'DELETE FROM board_columns WHERE id=? AND board_id=?',
        ).bind(id, boardId),
      );
    // A CHECK constraint guard aborts the entire batch on stale revision. D1 batch is transactional.
    statements.unshift(
      this.env.DB.prepare(
        'INSERT INTO mutation_guard(value) SELECT CASE WHEN revision=? THEN 1 ELSE 0 END FROM boards WHERE id=?',
      ).bind(state.board.revision, boardId),
    );
    statements.push(
      this.env.DB.prepare('UPDATE boards SET revision=? WHERE id=?').bind(
        event.revision,
        boardId,
      ),
    );
    statements.push(
      this.env.DB.prepare(
        'INSERT INTO board_events(event_id,board_id,revision,client_mutation_id,actor_id,type,payload,created_at) VALUES(?,?,?,?,?,?,?,?)',
      ).bind(
        event.eventId,
        boardId,
        event.revision,
        event.clientMutationId,
        actorId,
        event.type,
        JSON.stringify(patch),
        event.createdAt,
      ),
    );
    statements.push(this.env.DB.prepare('DELETE FROM mutation_guard'));
    await this.env.DB.batch(statements);
    return event;
  }
  private async replay(socket: WebSocket, boardId: string, after: number) {
    const db = drizzle(this.env.DB);
    const board = await db
      .select()
      .from(boards)
      .where(eq(boards.id, boardId))
      .get();
    assert(board, 404, 'Board not found');
    if (after > 0 && after <= board.revision && board.revision - after <= 200) {
      const rows = await db
        .select()
        .from(events)
        .where(and(eq(events.boardId, boardId), gt(events.revision, after)))
        .orderBy(asc(events.revision));
      if (
        rows.length === board.revision - after &&
        rows.every((row, i) => row.revision === after + i + 1)
      ) {
        for (const row of rows)
          this.send(socket, {
            type: 'event',
            event: eventSchema.parse({
              ...row,
              payload: JSON.parse(row.payload),
            }),
          });
        return;
      }
    }
    this.send(socket, {
      type: 'snapshot',
      snapshot: await loadSnapshot(this.env.DB, boardId),
    });
  }
  private async broadcastEvent(event: BoardEvent) {
    for (const { socket } of await this.authorizedSockets(event.boardId))
      this.send(socket, { type: 'event', event });
  }
  private async authorizedSockets(boardId: string) {
    const candidates = await Promise.all(
      this.ctx.getWebSockets().map(async (socket) => {
        const parsed = socketState.safeParse(socket.deserializeAttachment());
        const state = parsed.success ? parsed.data : null;
        const token =
          state?.boardId === boardId
            ? tokenFrom(
                new Request(state.origin, {
                  headers: { cookie: state.cookie },
                }),
              )
            : undefined;
        if (!state || !token) return { socket, state: null, sessionId: null };
        return {
          socket,
          state,
          sessionId: await sessionHash(token, this.env.SESSION_SECRET),
        };
      }),
    );
    const ids = candidates.flatMap(({ sessionId }) =>
      sessionId ? [sessionId] : [],
    );
    const allowed = new Map<string, string>();
    if (ids.length) {
      try {
        const rows = await this.env.DB.prepare(
          `SELECT s.id, s.user_id FROM sessions AS s
           JOIN boards AS b ON b.id = ?
           JOIN workspace_members AS m
             ON m.workspace_id = b.workspace_id AND m.user_id = s.user_id
           WHERE s.id IN (SELECT value FROM json_each(?)) AND s.expires_at > ?`,
        )
          .bind(boardId, JSON.stringify(ids), Date.now())
          .all<{ id: string; user_id: string }>();
        for (const row of rows.results) allowed.set(row.id, row.user_id);
      } catch {
        // A database failure must not leak events or presence to stale members.
      }
    }
    const recipients: {
      socket: WebSocket;
      state: z.infer<typeof socketState>;
    }[] = [];
    for (const { socket, state, sessionId } of candidates) {
      if (
        state &&
        sessionId &&
        socket.readyState === WebSocket.OPEN &&
        allowed.get(sessionId) === state.presence.userId
      )
        recipients.push({ socket, state });
      else if (socket.readyState === WebSocket.OPEN)
        socket.close(1008, 'Access expired');
    }
    return recipients;
  }
  private send(socket: WebSocket, message: ServerMessage) {
    try {
      socket.send(JSON.stringify(message));
    } catch {
      socket.close(1011, 'Connection unavailable');
    }
  }
  private async broadcastPresence(boardId: string) {
    const recipients = await this.authorizedSockets(boardId);
    const users = new Map<string, Presence>();
    for (const { state } of recipients) {
      const next = state.presence;
      const current = users.get(next.userId);
      // One hidden tab must not mark a user idle while another tab is active.
      if (
        !current ||
        (current.status === 'idle' && next.status === 'active') ||
        (current.status === next.status &&
          !current.selectedCardId &&
          next.selectedCardId)
      )
        users.set(next.userId, next);
    }
    for (const { socket } of recipients)
      this.send(socket, { type: 'presence', users: [...users.values()] });
  }
  async webSocketClose(socket: WebSocket, code: number) {
    const state = socketState.safeParse(socket.deserializeAttachment());
    socket.close([1005, 1006, 1015].includes(code) ? 1000 : code);
    if (state.success) await this.broadcastPresence(state.data.boardId);
  }
  async webSocketError(socket: WebSocket) {
    const state = socketState.safeParse(socket.deserializeAttachment());
    socket.close(1011, 'Connection error');
    if (state.success) await this.broadcastPresence(state.data.boardId);
  }
}
