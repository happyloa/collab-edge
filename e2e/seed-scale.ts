import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { writeFile, realpath } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, basename } from 'node:path';

/** Synthetic fixtures only; refuse external URLs and normal development state. */
export async function seedScale({
  boardId,
  actorId,
  columnIds,
  cards,
  commentsPerCard,
}: {
  boardId: string;
  actorId: string;
  columnIds: string[];
  cards: number;
  commentsPerCard: number;
}) {
  if (process.env.E2E_BASE_URL || !process.env.COLLABEDGE_E2E_STATE_PATH)
    throw new Error('Scale fixtures require the isolated local E2E runner');
  const root = await realpath(process.cwd());
  const parent = await realpath(join(root, '.wrangler'));
  const state = await realpath(process.env.COLLABEDGE_E2E_STATE_PATH);
  if (
    dirname(state).toLowerCase() !== parent.toLowerCase() ||
    !/^e2e-[a-zA-Z0-9_-]+$/.test(basename(state))
  )
    throw new Error('Refusing to seed non-test Cloudflare state');
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (
    ![boardId, actorId, ...columnIds].every((id) => uuid.test(id)) ||
    columnIds.length !== 4 ||
    ![25, 100, 200].includes(cards) ||
    ![5, 10, 20].includes(commentsPerCard)
  )
    throw new Error('Invalid scale fixture');
  const sql = (value: string) => "'" + value.replaceAll("'", "''") + "'";
  const statements: string[] = [];
  for (let index = 0; index < cards; index++) {
    const cardId = randomUUID();
    statements.push(`INSERT INTO cards(id,board_id,column_id,title,description,position,archived,updated_revision,title_revision,description_revision)
      VALUES(${[cardId, boardId, columnIds[index % 4], `Card ${index + 1}`, 'Description '.repeat(20)].map(sql).join(',')},${index * 1024},0,0,0,0);`);
    for (let comment = 0; comment < commentsPerCard; comment++)
      statements.push(`INSERT INTO card_comments(id,card_id,board_id,actor_id,body,created_at)
      VALUES(${[randomUUID(), cardId, boardId, actorId, 'A synthetic comment. '.repeat(20), '2026-10-05T00:00:00Z'].map(sql).join(',')});`);
  }
  const filename = join(state, `scale-${cards}-${randomUUID()}.sql`);
  await writeFile(filename, statements.join('\n'), { flag: 'wx' });
  const require = createRequire(import.meta.url);
  const cli = join(
    dirname(require.resolve('wrangler/package.json')),
    'bin',
    'wrangler.js',
  );
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        cli,
        'd1',
        'execute',
        'DB',
        '--local',
        '--persist-to',
        state,
        '--file',
        filename,
      ],
      { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let tail = '';
    const capture = (chunk: Buffer) => {
      tail = (tail + chunk.toString()).slice(-8000);
    };
    child.stdout.on('data', capture);
    child.stderr.on('data', capture);
    child.once('error', reject);
    child.once('exit', (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`Local scale fixture failed (${code}): ${tail}`)),
    );
  });
}
