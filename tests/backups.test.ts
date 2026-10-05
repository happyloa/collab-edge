import { env } from 'cloudflare:workers';
import { afterEach, expect, it } from 'vitest';
import {
  createBoardBackup,
  parseBoardBackup,
  canonicalJson,
  BACKUP_LIMITS,
} from '../src/backups/format';
import {
  prepareRestore,
  restoreChunks,
  verifyProof,
  leafHash,
} from '../src/backups/transfer';
import {
  startRestore,
  stageRestore,
  completeRestore,
  cancelRestore,
  cleanRestore,
  restoreStatus,
} from '../src/backups/restore';
import { createSession } from '../src/auth/session';
import { loadSnapshot } from '../src/db/queries/snapshot';
import type { Snapshot } from '../src/realtime/protocol';
import {
  GET as GET_JOB,
  PATCH as UPLOAD,
  POST as JOB_ACTION,
} from '../app/api/restore-jobs/[jobId]/route';
import {
  POST as START,
  GET as WORKSPACE_JOB,
} from '../app/api/workspaces/[workspaceId]/restores/route';

afterEach(async () => {
  await env.DB.prepare('DELETE FROM board_restore_jobs').run();
});

function backupFixture(): {
  snapshot: Snapshot;
  people: { id: string; name: string }[];
} {
  const boardId = crypto.randomUUID(),
    columnId = crypto.randomUUID(),
    alice = crypto.randomUUID(),
    bob = crypto.randomUUID();
  const first = crypto.randomUUID(),
    second = crypto.randomUUID();
  const card = (id: string, position: number, archived: boolean) => ({
    id,
    boardId,
    columnId,
    title: archived ? 'Archived source card' : 'Source card',
    description: 'Original multilingual text 原始內容',
    position,
    archived,
    updatedRevision: 3,
    titleRevision: 2,
    descriptionRevision: 2,
    assigneeId: alice,
    dueDate: '2026-10-20',
    assigneeRevision: 2,
    dueDateRevision: 2,
  });
  return {
    snapshot: {
      board: {
        id: boardId,
        workspaceId: crypto.randomUUID(),
        name: 'Recovered board',
        revision: 3,
        nameRevision: 2,
        archived: false,
      },
      columns: [
        {
          id: columnId,
          boardId,
          title: 'Source column',
          position: 999,
          updatedRevision: 2,
          titleRevision: 2,
        },
      ],
      cards: [card(first, 999, false), card(second, 20, true)],
      comments: [alice, bob].map((actorId, index) => ({
        id: crypto.randomUUID(),
        boardId,
        cardId: first,
        actorId,
        body: `Original comment ${index}`,
        createdAt: '2026-10-05T00:00:00Z',
      })),
      attachments: [
        {
          id: crypto.randomUUID(),
          boardId,
          cardId: first,
          actorId: alice,
          filename: 'source-notes.txt',
          mime: 'text/plain',
          size: 123,
          createdAt: '2026-10-05T00:00:00Z',
        },
      ],
    },
    people: [
      { id: alice, name: 'Original Alice' },
      { id: bob, name: 'Original Bob' },
    ],
  };
}
async function destination() {
  const owner = crypto.randomUUID(),
    editor = crypto.randomUUID(),
    viewer = crypto.randomUUID(),
    outsider = crypto.randomUUID(),
    workspaceId = crypto.randomUUID();
  await env.DB.batch([
    ...[owner, editor, viewer, outsider].map((id) =>
      env.DB.prepare(
        'INSERT INTO users(id,email,name,password,created_at) VALUES(?,?,?,?,0)',
      ).bind(id, `${id}@restore.test`, 'Restore fixture', 'not-a-login'),
    ),
    env.DB.prepare('INSERT INTO workspaces VALUES(?,?,?)').bind(
      workspaceId,
      'Restore destination',
      owner,
    ),
    ...[
      [owner, 'OWNER'],
      [editor, 'EDITOR'],
      [viewer, 'VIEWER'],
    ].map(([id, role]) =>
      env.DB.prepare('INSERT INTO workspace_members VALUES(?,?,?)').bind(
        workspaceId,
        id,
        role,
      ),
    ),
  ]);
  const cookies = new Map<string, string>();
  for (const actor of [owner, editor, viewer, outsider])
    cookies.set(
      actor,
      (await createSession(actor, new Request('https://restore.test'))).split(
        ';',
      )[0],
    );
  const request = (
    actor: string,
    path: string,
    method = 'GET',
    data?: unknown,
  ) =>
    new Request(`https://restore.test${path}`, {
      method,
      headers: {
        Cookie: cookies.get(actor)!,
        Origin: 'https://restore.test',
        'Content-Type': 'application/json',
      },
      ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
    });
  return { owner, editor, viewer, outsider, workspaceId, request };
}
async function prepared() {
  const source = backupFixture(),
    target = await destination();
  const backup = await createBoardBackup(source.snapshot, source.people);
  const transfer = await prepareRestore(backup);
  const jobId = crypto.randomUUID();
  const input = {
    jobId,
    root: transfer.root,
    header: transfer.header,
    proof: transfer.proof,
    assignees: { [source.people[0].id]: target.editor },
  };
  return { source, target, backup, transfer, jobId, input };
}

it('validates versioned checksums, legacy exports, relationships and immutable transfer proofs', async () => {
  const source = backupFixture(),
    backup = await createBoardBackup(source.snapshot, source.people);
  expect(
    await parseBoardBackup(JSON.parse(JSON.stringify(backup, null, 2))),
  ).toEqual(backup);
  const { checksum, ...legacy } = backup;
  expect(checksum.value).toHaveLength(64);
  expect(
    (await parseBoardBackup({ ...legacy, format: 'collabedge.board.v1' }))
      .format,
  ).toBe('collabedge.board.v1');
  await expect(
    parseBoardBackup({
      ...backup,
      snapshot: {
        ...backup.snapshot,
        board: { ...backup.snapshot.board, name: 'Tampered' },
      },
    }),
  ).rejects.toThrow('checksum');
  await expect(
    parseBoardBackup({
      ...legacy,
      format: 'collabedge.board.v1',
      snapshot: {
        ...legacy.snapshot,
        cards: [legacy.snapshot.cards[0], legacy.snapshot.cards[0]],
      },
    }),
  ).rejects.toThrow('duplicate');
  await expect(
    parseBoardBackup({
      ...legacy,
      format: 'collabedge.board.v1',
      snapshot: {
        ...legacy.snapshot,
        comments: [
          { ...legacy.snapshot.comments[0], cardId: crypto.randomUUID() },
        ],
      },
    }),
  ).rejects.toThrow('relationships');
  await expect(
    parseBoardBackup({ ...backup, password: 'Never accepted' }),
  ).rejects.toThrow();
  const transfer = await prepareRestore(backup),
    count = transfer.items.length + 1;
  expect(
    await verifyProof(transfer.root, 0, count, transfer.header, transfer.proof),
  ).toBe(true);
  for (const item of transfer.items)
    expect(
      await verifyProof(transfer.root, item.index, count, item.row, item.proof),
    ).toBe(true);
  const item = transfer.items[0];
  expect(item.row.kind).toBe('column');
  if (item.row.kind !== 'column') throw new Error('Expected a column');
  expect(
    await verifyProof(
      transfer.root,
      item.index,
      count,
      { ...item.row, payload: { ...item.row.payload, title: 'Changed' } },
      item.proof,
    ),
  ).toBe(false);
  expect(
    await verifyProof(transfer.root, item.index, count, item.row, [
      ...item.proof,
      await leafHash(0, transfer.header),
    ]),
  ).toBe(false);
});

it('restores into fresh local D1 atomically, normalizes ordering and retains metadata without impersonation', async () => {
  const { source, target, transfer, input, jobId } = await prepared();
  const first = await START(
    target.request(
      target.owner,
      `/api/workspaces/${target.workspaceId}/restores`,
      'POST',
      input,
    ),
  );
  expect(first.status).toBe(201);
  const job = (await first.json()) as { boardId: string };
  expect(
    await env.DB.prepare('SELECT id FROM boards WHERE id=?')
      .bind(job.boardId)
      .first(),
  ).toBeNull();
  for (const chunk of restoreChunks(transfer.items)) {
    for (let retry = 0; retry < 2; retry++)
      expect(
        (
          await UPLOAD(
            target.request(
              target.owner,
              `/api/restore-jobs/${jobId}`,
              'PATCH',
              { items: chunk },
            ),
          )
        ).status,
      ).toBe(200);
  }
  expect((await restoreStatus(env.DB, jobId, target.owner)).received).toBe(
    transfer.items.length,
  );
  const result = await JOB_ACTION(
    target.request(target.owner, `/api/restore-jobs/${jobId}`, 'POST', {
      action: 'complete',
    }),
  );
  expect(result.status).toBe(200);
  const snapshot = await loadSnapshot(env.DB, job.boardId);
  expect(snapshot.board).toMatchObject({
    workspaceId: target.workspaceId,
    name: source.snapshot.board.name,
    revision: 1,
  });
  expect(snapshot.board.id).not.toBe(source.snapshot.board.id);
  expect(snapshot.columns[0]).toMatchObject({
    position: 0,
    updatedRevision: 1,
  });
  expect(snapshot.cards.map((card) => card.id)).not.toContain(
    source.snapshot.cards[0].id,
  );
  expect(snapshot.cards.find((card) => !card.archived)).toMatchObject({
    position: 1,
    description: source.snapshot.cards[0].description,
    assigneeId: target.editor,
    dueDate: '2026-10-20',
  });
  expect(snapshot.cards.find((card) => card.archived)?.position).toBe(0);
  expect(snapshot.comments.map((comment) => comment.body).sort()).toEqual(
    source.snapshot.comments.map((comment) => comment.body).sort(),
  );
  expect(
    snapshot.comments.map((comment) => comment.importedAuthorName).sort(),
  ).toEqual(['Original Alice', 'Original Bob']);
  expect(
    snapshot.comments.every(
      (comment) =>
        comment.actorId === target.owner &&
        comment.cardId === snapshot.cards.find((card) => !card.archived)?.id,
    ),
  ).toBe(true);
  expect(snapshot.attachments).toEqual([]);
  expect(snapshot.attachmentReferences?.[0]).toMatchObject({
    filename: 'source-notes.txt',
    size: 123,
    actorId: target.owner,
  });
  expect(snapshot.attachmentReferences?.[0]).not.toHaveProperty('objectKey');
  expect((await completeRestore(env.DB, jobId, target.owner)).boardId).toBe(
    job.boardId,
  );
  expect(
    await env.DB.prepare(
      'SELECT COUNT(*) AS count FROM board_events WHERE board_id=?',
    )
      .bind(job.boardId)
      .first('count'),
  ).toBe(1);
  expect(
    await env.DB.prepare('SELECT COUNT(*) AS count FROM users').first('count'),
  ).toBe(4);
  expect(await cleanRestore(env.DB, jobId, target.owner)).toEqual({
    done: true,
  });
  expect((await restoreStatus(env.DB, jobId, target.owner)).state).toBe(
    'complete',
  );
  expect(
    (await startRestore(env.DB, target.workspaceId, target.owner, input))
      .boardId,
  ).toBe(job.boardId);
});

it('denies unauthorized operations, altered chunks and changed account/source retries', async () => {
  const { target, transfer, input, jobId } = await prepared();
  for (const actor of [target.editor, target.viewer, target.outsider])
    expect(
      (
        await START(
          target.request(
            actor,
            `/api/workspaces/${target.workspaceId}/restores`,
            'POST',
            input,
          ),
        )
      ).status,
    ).toBe(403);
  await startRestore(env.DB, target.workspaceId, target.owner, input);
  for (const actor of [target.editor, target.viewer, target.outsider])
    expect(
      (await GET_JOB(target.request(actor, `/api/restore-jobs/${jobId}`)))
        .status,
    ).toBe(403);
  const tampered = structuredClone(transfer.items[0]);
  if (tampered.row.kind === 'column') tampered.row.payload.title = 'Altered';
  expect(
    (
      await UPLOAD(
        target.request(target.owner, `/api/restore-jobs/${jobId}`, 'PATCH', {
          items: [tampered],
        }),
      )
    ).status,
  ).toBe(400);
  expect((await restoreStatus(env.DB, jobId, target.owner)).received).toBe(0);
  await expect(
    startRestore(env.DB, target.workspaceId, target.owner, {
      ...input,
      assignees: {},
    }),
  ).rejects.toMatchObject({ status: 409 });
  await env.DB.prepare('UPDATE workspaces SET owner_id=? WHERE id=?')
    .bind(target.editor, target.workspaceId)
    .run();
  await env.DB.prepare(
    "UPDATE workspace_members SET role='OWNER' WHERE workspace_id=? AND user_id=?",
  )
    .bind(target.workspaceId, target.editor)
    .run();
  expect(
    (
      await UPLOAD(
        target.request(target.owner, `/api/restore-jobs/${jobId}`, 'PATCH', {
          items: transfer.items,
        }),
      )
    ).status,
  ).toBe(403);
  await expect(
    stageRestore(env.DB, jobId, target.editor, transfer.items),
  ).rejects.toMatchObject({ status: 403 });
  expect(
    (
      await WORKSPACE_JOB(
        target.request(
          target.editor,
          `/api/workspaces/${target.workspaceId}/restores`,
        ),
      )
    ).status,
  ).toBe(200);
  await cancelRestore(env.DB, jobId, target.editor);
  expect(await cleanRestore(env.DB, jobId, target.editor)).toEqual({
    done: true,
  });
});

it('keeps incomplete uploads private and rolls back the whole copy when quotas or assignments change', async () => {
  const { target, transfer, input, jobId } = await prepared();
  const job = await startRestore(
    env.DB,
    target.workspaceId,
    target.owner,
    input,
  );
  await stageRestore(env.DB, jobId, target.owner, transfer.items.slice(0, 1));
  await expect(
    completeRestore(env.DB, jobId, target.owner),
  ).rejects.toMatchObject({ status: 409 });
  await stageRestore(env.DB, jobId, target.owner, transfer.items);
  const retainedCount = await env.DB.prepare(
    "SELECT used FROM quotas WHERE key='restore-copy-bytes'",
  ).first<number>('used');
  await env.DB.prepare(
    "INSERT INTO quotas VALUES('restore-copy-bytes',?) ON CONFLICT(key) DO UPDATE SET used=excluded.used",
  )
    .bind(BACKUP_LIMITS.retainedBytes)
    .run();
  await expect(
    completeRestore(env.DB, jobId, target.owner),
  ).rejects.toMatchObject({ status: 429 });
  expect(
    await env.DB.prepare('SELECT id FROM boards WHERE id=?')
      .bind(job.boardId)
      .first(),
  ).toBeNull();
  await env.DB.prepare(
    "UPDATE quotas SET used=? WHERE key='restore-copy-bytes'",
  )
    .bind(retainedCount ?? 0)
    .run();
  const eventCount = await env.DB.prepare(
    "SELECT used FROM quotas WHERE key='event-count'",
  ).first<number>('used');
  await env.DB.prepare(
    "INSERT INTO quotas VALUES('event-count',20000) ON CONFLICT(key) DO UPDATE SET used=20000",
  ).run();
  await expect(
    completeRestore(env.DB, jobId, target.owner),
  ).rejects.toMatchObject({ status: 429 });
  expect(
    await env.DB.prepare('SELECT id FROM boards WHERE id=?')
      .bind(job.boardId)
      .first(),
  ).toBeNull();
  expect((await restoreStatus(env.DB, jobId, target.owner)).state).toBe(
    'uploading',
  );
  await env.DB.prepare("UPDATE quotas SET used=? WHERE key='event-count'")
    .bind(eventCount ?? 0)
    .run();
  await env.DB.prepare(
    'DELETE FROM workspace_members WHERE workspace_id=? AND user_id=?',
  )
    .bind(target.workspaceId, target.editor)
    .run();
  await expect(
    completeRestore(env.DB, jobId, target.owner),
  ).rejects.toMatchObject({ status: 409 });
  expect(
    await env.DB.prepare('SELECT COUNT(*) AS count FROM cards WHERE board_id=?')
      .bind(job.boardId)
      .first('count'),
  ).toBe(0);
  await env.DB.prepare("INSERT INTO workspace_members VALUES(?,?,'EDITOR')")
    .bind(target.workspaceId, target.editor)
    .run();
  expect((await completeRestore(env.DB, jobId, target.owner)).state).toBe(
    'complete',
  );
});

it('bounds UTF-8 chunks, staging storage, expiry and global pending work', async () => {
  const { target, transfer, input, jobId } = await prepared();
  await startRestore(env.DB, target.workspaceId, target.owner, input);
  await expect(
    stageRestore(env.DB, jobId, target.owner, transfer.items.slice(1, 2)),
  ).rejects.toMatchObject({ status: 400 });
  await expect(
    startRestore(env.DB, target.workspaceId, target.owner, {
      ...input,
      jobId: crypto.randomUUID(),
    }),
  ).rejects.toMatchObject({ status: 409 });
  for (const chunk of restoreChunks(transfer.items))
    expect(
      new TextEncoder().encode(JSON.stringify({ items: chunk })).byteLength,
    ).toBeLessThanOrEqual(32768);
  await env.DB.prepare('UPDATE board_restore_jobs SET byte_count=? WHERE id=?')
    .bind(BACKUP_LIMITS.stagedBytes, jobId)
    .run();
  await expect(
    stageRestore(env.DB, jobId, target.owner, transfer.items),
  ).rejects.toMatchObject({ status: 429 });
  expect((await restoreStatus(env.DB, jobId, target.owner)).received).toBe(0);
  await env.DB.prepare(
    'UPDATE board_restore_jobs SET byte_count=0,expires_at=1 WHERE id=?',
  )
    .bind(jobId)
    .run();
  await expect(
    stageRestore(env.DB, jobId, target.owner, transfer.items),
  ).rejects.toMatchObject({ status: 410 });
  await cancelRestore(env.DB, jobId, target.owner);
  await cleanRestore(env.DB, jobId, target.owner);
  expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }));
});

it('rejects malformed relations and per-card overflows on the server without relying on file validation', async () => {
  const target = await destination();
  for (const brokenParent of [true, false]) {
    const source = backupFixture();
    const backup = await createBoardBackup(source.snapshot, source.people);
    if (brokenParent) backup.snapshot.cards[0].columnId = crypto.randomUUID();
    else
      backup.snapshot.comments = Array.from({ length: 51 }, () => ({
        ...source.snapshot.comments[0],
        id: crypto.randomUUID(),
      }));
    const transfer = await prepareRestore(backup),
      jobId = crypto.randomUUID();
    const job = await startRestore(env.DB, target.workspaceId, target.owner, {
      jobId,
      root: transfer.root,
      header: transfer.header,
      proof: transfer.proof,
      assignees: {},
    });
    for (const chunk of restoreChunks(transfer.items))
      await stageRestore(env.DB, jobId, target.owner, chunk);
    await expect(
      completeRestore(env.DB, jobId, target.owner),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      await env.DB.prepare('SELECT id FROM boards WHERE id=?')
        .bind(job.boardId)
        .first(),
    ).toBeNull();
    expect(
      await env.DB.prepare('SELECT event_id FROM board_events WHERE board_id=?')
        .bind(job.boardId)
        .first(),
    ).toBeNull();
    await cancelRestore(env.DB, jobId, target.owner);
    await cleanRestore(env.DB, jobId, target.owner);
  }
});

it('enforces the daily staging quota transactionally and does not charge duplicate rows', async () => {
  const { target, transfer, input, jobId } = await prepared();
  await startRestore(env.DB, target.workspaceId, target.owner, input);
  await stageRestore(env.DB, jobId, target.owner, transfer.items.slice(0, 1));
  const counter = await env.DB.prepare(
    "SELECT key,used FROM quotas WHERE key LIKE 'restore-items:%' ORDER BY key DESC LIMIT 1",
  ).first<{ key: string; used: number }>();
  expect(counter).not.toBeNull();
  if (!counter) throw new Error('Missing restore counter');
  await env.DB.prepare('UPDATE quotas SET used=15000 WHERE key=?')
    .bind(counter.key)
    .run();
  await stageRestore(env.DB, jobId, target.owner, transfer.items.slice(0, 1));
  await expect(
    stageRestore(env.DB, jobId, target.owner, transfer.items.slice(1, 2)),
  ).rejects.toMatchObject({ status: 429 });
  expect((await restoreStatus(env.DB, jobId, target.owner)).received).toBe(1);
  expect(
    await env.DB.prepare('SELECT used FROM quotas WHERE key=?')
      .bind(counter.key)
      .first('used'),
  ).toBe(15000);
  await env.DB.prepare('UPDATE quotas SET used=? WHERE key=?')
    .bind(counter.used, counter.key)
    .run();
});

it('restores a multi-chunk board with maximum UTF-8 fields and cleans staging in bounded pages', async () => {
  const source = backupFixture(),
    target = await destination();
  source.snapshot.cards.push(
    ...Array.from({ length: 18 }, (_, offset) => ({
      ...source.snapshot.cards[0],
      id: crypto.randomUUID(),
      position: offset + 1000,
    })),
  );
  source.snapshot.cards[0].description = '中'.repeat(10000);
  source.snapshot.comments = source.snapshot.cards.flatMap((card) =>
    Array.from({ length: 50 }, (_, index) => ({
      ...source.snapshot.comments[0],
      id: crypto.randomUUID(),
      cardId: card.id,
      body: index === 0 ? '文'.repeat(2000) : `History ${index}`,
    })),
  );
  const backup = await createBoardBackup(source.snapshot, source.people),
    transfer = await prepareRestore(backup),
    jobId = crypto.randomUUID();
  const input = {
    jobId,
    root: transfer.root,
    header: transfer.header,
    proof: transfer.proof,
    assignees: {},
  };
  const job = await startRestore(
    env.DB,
    target.workspaceId,
    target.owner,
    input,
  );
  const chunks = restoreChunks(transfer.items);
  expect(chunks.length).toBeGreaterThan(30);
  for (const chunk of chunks) {
    expect(
      new TextEncoder().encode(JSON.stringify({ items: chunk })).byteLength,
    ).toBeLessThanOrEqual(32768);
    await stageRestore(env.DB, jobId, target.owner, chunk);
  }
  await completeRestore(env.DB, jobId, target.owner);
  const restored = await loadSnapshot(env.DB, job.boardId);
  expect(restored.cards).toHaveLength(20);
  expect(restored.comments).toHaveLength(1000);
  expect(
    restored.cards.find((card) => card.description.length === 10000)
      ?.description,
  ).toBe('中'.repeat(10000));
  expect(
    restored.comments.filter((comment) => comment.body === '文'.repeat(2000)),
  ).toHaveLength(20);
  await expect(
    startRestore(env.DB, target.workspaceId, target.owner, {
      ...input,
      jobId: crypto.randomUUID(),
    }),
  ).rejects.toMatchObject({ status: 409 });
  expect(await cleanRestore(env.DB, jobId, target.owner)).toEqual({
    done: false,
  });
  expect(
    await env.DB.prepare(
      'SELECT COUNT(*) AS count FROM board_restore_items WHERE job_id=?',
    )
      .bind(jobId)
      .first('count'),
  ).toBe(transfer.items.length - 500);
  expect(await cleanRestore(env.DB, jobId, target.owner)).toEqual({
    done: false,
  });
  expect(await cleanRestore(env.DB, jobId, target.owner)).toEqual({
    done: true,
  });
  expect((await completeRestore(env.DB, jobId, target.owner)).boardId).toBe(
    job.boardId,
  );
}, 30000);
