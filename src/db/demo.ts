import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { users, workspaces, members, boards, columns, cards } from './schema';
// Public fixture identifiers, not Cloudflare resource identifiers or credentials.
export const DEMO = {
  workspace: '9e8cd470-a3ac-4a5e-96ed-420bd572d451',
  board: '3ed2db2d-1ab5-4d42-a7d7-7ed13aa3b6de',
  owner: '7b81e50e-1845-4916-a8e9-3c423ca95045',
  Alice: '9f258724-c4ed-4e86-9c29-c64e31d881d6',
  Bob: 'd4a0b6ba-15a0-42b9-a074-b59ddedac55c',
};
export async function seedDemo(binding: D1Database) {
  const db = drizzle(binding);
  if (
    await db
      .select({ id: boards.id })
      .from(boards)
      .where(eq(boards.id, DEMO.board))
      .get()
  )
    return;
  const columnRows = ['Backlog', 'In Progress', 'Review', 'Done'].map(
    (title, position) => ({
      id: crypto.randomUUID(),
      boardId: DEMO.board,
      title,
      position,
      updatedRevision: 0,
      titleRevision: 0,
    }),
  );
  const titles = [
    'Map the customer journey',
    'Draft the launch announcement',
    'Build the new home page',
    'Refine the mobile navigation',
    'Review keyboard accessibility',
    'Approve the visual direction',
    'Agree on success metrics',
  ];
  try {
    await db.batch([
      db.insert(users).values(
        [
          ['owner', DEMO.owner],
          ['Alice', DEMO.Alice],
          ['Bob', DEMO.Bob],
        ].map(([name, id]) => ({
          id,
          email: `demo-${name.toLowerCase()}@collabedge.invalid`,
          name: name === 'owner' ? 'Demo administrator' : name,
          password: 'disabled-demo-password-login',
          createdAt: Date.now(),
        })),
      ),
      db.insert(workspaces).values({
        id: DEMO.workspace,
        name: 'Acme Product Team',
        ownerId: DEMO.owner,
      }),
      db.insert(members).values([
        { workspaceId: DEMO.workspace, userId: DEMO.owner, role: 'OWNER' },
        { workspaceId: DEMO.workspace, userId: DEMO.Alice, role: 'EDITOR' },
        { workspaceId: DEMO.workspace, userId: DEMO.Bob, role: 'EDITOR' },
      ]),
      db.insert(boards).values({
        id: DEMO.board,
        workspaceId: DEMO.workspace,
        name: 'Website Launch',
      }),
      db.insert(columns).values(columnRows),
      db.insert(cards).values(
        titles.map((title, index) => ({
          id: crypto.randomUUID(),
          boardId: DEMO.board,
          columnId: columnRows[Math.min(3, Math.floor(index / 2))].id,
          title,
          description: [
            'Bring a clear point of view and a first draft to our next team review.',
            'Keep the experience focused, accessible, and easy to understand.',
          ][index % 2],
          position: index % 2,
          updatedRevision: 0,
          titleRevision: 0,
          descriptionRevision: 0,
        })),
      ),
    ]);
  } catch (error) {
    // Concurrent first visitors race on unique keys; D1 rolls back the losing batch.
    if (
      !(await db
        .select({ id: boards.id })
        .from(boards)
        .where(eq(boards.id, DEMO.board))
        .get())
    )
      throw error;
  }
}
