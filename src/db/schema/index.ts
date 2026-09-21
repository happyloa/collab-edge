import {
  sqliteTable,
  text,
  integer,
  primaryKey,
  uniqueIndex,
  index,
} from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text().primaryKey(),
  email: text().notNull().unique(),
  name: text().notNull(),
  password: text().notNull(),
  createdAt: integer('created_at').notNull(),
});
export const sessions = sqliteTable(
  'sessions',
  {
    id: text().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: integer('expires_at').notNull(),
  },
  (t) => [index('sessions_expiry').on(t.expiresAt)],
);
export const workspaces = sqliteTable('workspaces', {
  id: text().primaryKey(),
  name: text().notNull(),
  ownerId: text('owner_id')
    .notNull()
    .references(() => users.id),
});
export const members = sqliteTable(
  'workspace_members',
  {
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text({ enum: ['OWNER', 'EDITOR', 'VIEWER'] }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.userId] }),
    index('members_user').on(t.userId),
  ],
);
export const boards = sqliteTable(
  'boards',
  {
    id: text().primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    revision: integer().notNull().default(0),
  },
  (t) => [index('boards_workspace').on(t.workspaceId)],
);
export const columns = sqliteTable(
  'board_columns',
  {
    id: text().primaryKey(),
    boardId: text('board_id')
      .notNull()
      .references(() => boards.id, { onDelete: 'cascade' }),
    title: text().notNull(),
    position: integer().notNull(),
    updatedRevision: integer('updated_revision').notNull(),
    titleRevision: integer('title_revision').notNull(),
  },
  (t) => [index('columns_board').on(t.boardId)],
);
export const cards = sqliteTable(
  'cards',
  {
    id: text().primaryKey(),
    boardId: text('board_id')
      .notNull()
      .references(() => boards.id, { onDelete: 'cascade' }),
    columnId: text('column_id')
      .notNull()
      .references(() => columns.id, { onDelete: 'cascade' }),
    title: text().notNull(),
    description: text().notNull().default(''),
    position: integer().notNull(),
    archived: integer({ mode: 'boolean' }).notNull().default(false),
    updatedRevision: integer('updated_revision').notNull(),
    titleRevision: integer('title_revision').notNull(),
    descriptionRevision: integer('description_revision').notNull(),
  },
  (t) => [
    index('cards_board').on(t.boardId),
    index('cards_column').on(t.columnId),
  ],
);
export const comments = sqliteTable(
  'card_comments',
  {
    id: text().primaryKey(),
    cardId: text('card_id')
      .notNull()
      .references(() => cards.id, { onDelete: 'cascade' }),
    boardId: text('board_id')
      .notNull()
      .references(() => boards.id, { onDelete: 'cascade' }),
    actorId: text('actor_id')
      .notNull()
      .references(() => users.id),
    body: text().notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    index('comments_board').on(t.boardId),
    index('comments_card').on(t.cardId),
  ],
);
export const attachments = sqliteTable(
  'attachments',
  {
    id: text().primaryKey(),
    cardId: text('card_id')
      .notNull()
      .references(() => cards.id, { onDelete: 'cascade' }),
    boardId: text('board_id')
      .notNull()
      .references(() => boards.id, { onDelete: 'cascade' }),
    objectKey: text('object_key').notNull().unique(),
    filename: text().notNull(),
    mime: text().notNull(),
    size: integer().notNull(),
    actorId: text('actor_id')
      .notNull()
      .references(() => users.id),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    index('attachments_board').on(t.boardId),
    index('attachments_card').on(t.cardId),
  ],
);
export const events = sqliteTable(
  'board_events',
  {
    eventId: text('event_id').primaryKey(),
    boardId: text('board_id')
      .notNull()
      .references(() => boards.id, { onDelete: 'cascade' }),
    revision: integer().notNull(),
    clientMutationId: text('client_mutation_id').notNull(),
    actorId: text('actor_id').notNull(),
    type: text().notNull(),
    payload: text().notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    uniqueIndex('events_revision').on(t.boardId, t.revision),
    uniqueIndex('events_mutation').on(t.boardId, t.clientMutationId),
  ],
);
export const quotas = sqliteTable('quotas', {
  key: text().primaryKey(),
  used: integer().notNull().default(0),
});
