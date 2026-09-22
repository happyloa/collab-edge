import { DurableObject } from 'cloudflare:workers';
import { z } from 'zod';
import { drizzle } from 'drizzle-orm/d1';
import { and, eq, gt, asc } from 'drizzle-orm';
import { boards, events } from '../../src/db/schema';
import { currentUser, boardAccess } from '../../src/auth/session';
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
        this.broadcastPresence();
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
        if (message.type === 'hello' || message.type === 'resync')
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
          this.broadcastPresence();
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
    for (const card of patch.cards ?? [])
      statements.push(
        this.env.DB.prepare(
          'INSERT INTO cards(id,board_id,column_id,title,description,position,archived,updated_revision,title_revision,description_revision) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET column_id=excluded.column_id,title=excluded.title,description=excluded.description,position=excluded.position,archived=excluded.archived,updated_revision=excluded.updated_revision,title_revision=excluded.title_revision,description_revision=excluded.description_revision',
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
        ),
      );
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
    // Reauthorize recipients as well as senders so revoked members cannot keep receiving updates.
    for (const socket of this.ctx.getWebSockets()) {
      try {
        const state = socketState.parse(socket.deserializeAttachment());
        const user = await currentUser(
          new Request(state.origin, { headers: { cookie: state.cookie } }),
        );
        assert(user, 401, 'Expired');
        await boardAccess(user.id, event.boardId);
        this.send(socket, { type: 'event', event });
      } catch {
        socket.close(1008, 'Access expired');
      }
    }
  }
  private send(socket: WebSocket, message: ServerMessage) {
    try {
      socket.send(JSON.stringify(message));
    } catch {
      socket.close(1011, 'Connection unavailable');
    }
  }
  private broadcastPresence() {
    const users = new Map<string, Presence>();
    for (const socket of this.ctx.getWebSockets()) {
      const state = socketState.safeParse(socket.deserializeAttachment());
      if (state.success)
        users.set(state.data.presence.userId, state.data.presence);
    }
    for (const socket of this.ctx.getWebSockets())
      this.send(socket, { type: 'presence', users: [...users.values()] });
  }
  webSocketClose(socket: WebSocket, code: number) {
    socket.close([1005, 1006, 1015].includes(code) ? 1000 : code);
    this.broadcastPresence();
  }
  webSocketError(socket: WebSocket) {
    socket.close(1011, 'Connection error');
    this.broadcastPresence();
  }
}
