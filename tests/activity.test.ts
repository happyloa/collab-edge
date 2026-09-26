import { env } from 'cloudflare:workers';
import { expect, it } from 'vitest';
import { GET } from '../app/api/boards/[boardId]/activity/route';
import { createSession } from '../src/auth/session';

const origin = 'https://activity.test';

async function fixture() {
  const ownerId = crypto.randomUUID();
  const outsiderId = crypto.randomUUID();
  const workspaceId = crypto.randomUUID();
  const boardId = crypto.randomUUID();
  await env.DB.batch([
    ...[ownerId, outsiderId].map((id) =>
      env.DB.prepare(
        'INSERT INTO users(id,email,name,password,created_at) VALUES(?,?,?,?,?)',
      ).bind(id, `${id}@example.com`, 'Activity tester', 'unused', Date.now()),
    ),
    env.DB.prepare('INSERT INTO workspaces VALUES(?,?,?)').bind(
      workspaceId,
      'Activity workspace',
      ownerId,
    ),
    env.DB.prepare('INSERT INTO workspace_members VALUES(?,?,?)').bind(
      workspaceId,
      ownerId,
      'OWNER',
    ),
    env.DB.prepare(
      'INSERT INTO boards(id,workspace_id,name,revision) VALUES(?,?,?,?)',
    ).bind(boardId, workspaceId, 'Activity board', 7),
    ...Array.from({ length: 7 }, (_, index) =>
      env.DB.prepare(
        'INSERT INTO board_events(event_id,board_id,revision,client_mutation_id,actor_id,type,payload,created_at) VALUES(?,?,?,?,?,?,?,?)',
      ).bind(
        crypto.randomUUID(),
        boardId,
        index + 1,
        crypto.randomUUID(),
        ownerId,
        'card.create',
        '{}',
        new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
      ),
    ),
  ]);
  const ownerCookie = (await createSession(ownerId, new Request(origin))).split(
    ';',
  )[0];
  const outsiderCookie = (
    await createSession(outsiderId, new Request(origin))
  ).split(';')[0];
  const page = (query = '', cookie = ownerCookie) =>
    GET(
      new Request(`${origin}/api/boards/${boardId}/activity${query}`, {
        headers: { Cookie: cookie },
      }),
    );
  return { page, outsiderCookie };
}

it('pages board events newest first with an exclusive revision cursor', async () => {
  const { page } = await fixture();
  const first = await page('?limit=3');
  expect(first.status).toBe(200);
  const firstData = (await first.json()) as {
    events: { revision: number }[];
    nextBefore: number | null;
  };
  expect(firstData.events.map((event) => event.revision)).toEqual([7, 6, 5]);
  expect(firstData.nextBefore).toBe(5);

  const second = await page(`?limit=3&before=${firstData.nextBefore}`);
  const secondData = (await second.json()) as typeof firstData;
  expect(secondData.events.map((event) => event.revision)).toEqual([4, 3, 2]);
  expect(secondData.nextBefore).toBe(2);

  const last = await page(`?limit=3&before=${secondData.nextBefore}`);
  const lastData = (await last.json()) as typeof firstData;
  expect(lastData.events.map((event) => event.revision)).toEqual([1]);
  expect(lastData.nextBefore).toBeNull();
});

it('keeps activity private and rejects unbounded or invalid page requests', async () => {
  const { page, outsiderCookie } = await fixture();
  expect((await page('', '')).status).toBe(401);
  expect((await page('', outsiderCookie)).status).toBe(403);
  expect((await page('?limit=51')).status).toBe(400);
  expect((await page('?before=0')).status).toBe(400);
  expect((await page('?before=oops')).status).toBe(400);
});
