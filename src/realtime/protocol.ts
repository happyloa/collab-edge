import { z } from 'zod';
export const id = z.uuid();
const title = z.string().trim().min(1).max(160);
const revision = z.number().int().nonnegative();
const anchor = id.nullable();
export const commandSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('board.rename'),
    payload: z.object({ id, title }),
  }),
  z.object({ type: z.literal('board.archive'), payload: z.object({ id }) }),
  z.object({ type: z.literal('board.restore'), payload: z.object({ id }) }),
  z.object({
    type: z.literal('column.create'),
    payload: z.object({ id, title }),
  }),
  z.object({
    type: z.literal('column.rename'),
    payload: z.object({ id, title }),
  }),
  z.object({
    type: z.literal('column.move'),
    payload: z.object({ id, beforeId: anchor }),
  }),
  z.object({ type: z.literal('column.remove'), payload: z.object({ id }) }),
  z.object({
    type: z.literal('card.create'),
    payload: z.object({ id, columnId: id, title }),
  }),
  z.object({
    type: z.literal('card.update'),
    payload: z
      .object({
        id,
        title: title.optional(),
        description: z.string().max(10000).optional(),
        assigneeId: id.nullable().optional(),
        dueDate: z.iso.date().nullable().optional(),
      })
      .refine(
        (v) =>
          v.title !== undefined ||
          v.description !== undefined ||
          v.assigneeId !== undefined ||
          v.dueDate !== undefined,
      ),
  }),
  z.object({
    type: z.literal('card.move'),
    payload: z.object({ id, columnId: id, beforeId: anchor }),
  }),
  z.object({ type: z.literal('card.archive'), payload: z.object({ id }) }),
  z.object({ type: z.literal('card.restore'), payload: z.object({ id }) }),
  z.object({
    type: z.literal('comment.create'),
    payload: z.object({
      id,
      cardId: id,
      body: z.string().trim().min(1).max(2000),
    }),
  }),
]);
export const mutationSchema = z.object({
  clientMutationId: id,
  baseRevision: revision,
  command: commandSchema,
});
export type Command = z.infer<typeof commandSchema>;
export type Mutation = z.infer<typeof mutationSchema>;
export const presenceSchema = z.object({
  userId: id,
  displayName: z.string().max(80),
  status: z.enum(['active', 'idle']),
  selectedCardId: id.optional(),
});
export type Presence = z.infer<typeof presenceSchema>;
export const clientMessage = z.discriminatedUnion('type', [
  z.object({ type: z.literal('resync'), lastSeenRevision: revision }),
  z.object({ type: z.literal('mutate'), mutation: mutationSchema }),
  z.object({
    type: z.literal('presence'),
    status: z.enum(['active', 'idle']),
    selectedCardId: id.optional(),
  }),
  z.object({ type: z.literal('ping') }),
]);
export const columnSchema = z.object({
  id,
  boardId: id,
  title,
  position: z.number().int(),
  updatedRevision: revision,
  titleRevision: revision,
});
export const cardSchema = z.object({
  id,
  boardId: id,
  columnId: id,
  title,
  description: z.string(),
  position: z.number().int(),
  archived: z.boolean(),
  updatedRevision: revision,
  titleRevision: revision,
  descriptionRevision: revision,
  assigneeId: id.nullable().default(null),
  dueDate: z.iso.date().nullable().default(null),
  assigneeRevision: revision.default(0),
  dueDateRevision: revision.default(0),
});
export const commentSchema = z.object({
  id,
  cardId: id,
  boardId: id,
  actorId: id,
  body: z.string(),
  createdAt: z.string(),
});
export const attachmentSchema = z.object({
  id,
  cardId: id,
  boardId: id,
  filename: z.string(),
  mime: z.string(),
  size: z.number(),
  actorId: id,
  createdAt: z.string(),
});
export const snapshotSchema = z.object({
  board: z.object({
    id,
    workspaceId: id,
    name: z.string(),
    revision,
    nameRevision: revision,
    archived: z.boolean(),
  }),
  columns: z.array(columnSchema),
  cards: z.array(cardSchema),
  comments: z.array(commentSchema),
  attachments: z.array(attachmentSchema),
});
export type Snapshot = z.infer<typeof snapshotSchema>;
export const patchSchema = z.object({
  board: z
    .object({ name: z.string(), nameRevision: revision, archived: z.boolean() })
    .optional(),
  columns: z.array(columnSchema).optional(),
  cards: z.array(cardSchema).optional(),
  comments: z.array(commentSchema).optional(),
  removedColumns: z.array(id).optional(),
  attachments: z.array(attachmentSchema).optional(),
  removedAttachments: z.array(id).optional(),
});
export type Patch = z.infer<typeof patchSchema>;
export const eventSchema = z.object({
  boardId: id,
  revision,
  eventId: id,
  clientMutationId: id,
  actorId: id,
  type: z.string(),
  payload: patchSchema,
  createdAt: z.string(),
});
export type BoardEvent = z.infer<typeof eventSchema>;
export const serverMessage = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('ready'),
    revision,
    role: z.enum(['OWNER', 'EDITOR', 'VIEWER']),
    userId: id,
  }),
  z.object({ type: z.literal('snapshot'), snapshot: snapshotSchema }),
  z.object({ type: z.literal('event'), event: eventSchema }),
  z.object({ type: z.literal('ack'), clientMutationId: id, revision }),
  z.object({ type: z.literal('presence'), users: z.array(presenceSchema) }),
  z.object({
    type: z.literal('conflict'),
    clientMutationId: id,
    serverRevision: revision,
    reason: z.string(),
    snapshot: snapshotSchema,
  }),
  z.object({
    type: z.literal('error'),
    message: z.string(),
    clientMutationId: id.optional(),
  }),
  z.object({ type: z.literal('pong') }),
]);
export type ServerMessage = z.infer<typeof serverMessage>;
