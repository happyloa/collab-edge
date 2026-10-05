import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';

const parent = realpathSync(tmpdir());
const root = mkdtempSync(join(parent, 'collab-auth-'));
const script = fileURLToPath(
  new URL('../scripts/generate-auth-keys.mjs', import.meta.url),
);
try {
  const first = spawnSync(process.execPath, [script], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(first.status, 0);
  const path = join(root, '.tools', 'auth-keys.initial.json');
  const original = readFileSync(path, 'utf8');
  const { secrets } = JSON.parse(original);
  assert.deepEqual(Object.keys(secrets).sort(), [
    'PASSWORD_PEPPERS',
    'SESSION_SIGNING_KEY',
  ]);
  for (const [name, binding] of Object.entries(secrets)) {
    assert.equal(binding.name, name);
    assert.equal(binding.type, 'secret_text');
    assert.equal(first.stdout.includes(binding.text), false);
    assert.equal(first.stderr.includes(binding.text), false);
  }
  const session = secrets.SESSION_SIGNING_KEY.text;
  const pepper = JSON.parse(secrets.PASSWORD_PEPPERS.text).p1;
  assert.match(session, /^[A-Za-z0-9_-]{64}$/);
  assert.match(pepper, /^[A-Za-z0-9_-]{64}$/);
  assert.notEqual(session, pepper);
  assert.equal(Buffer.from(session, 'base64url').length, 48);
  assert.equal(Buffer.from(pepper, 'base64url').length, 48);
  const second = spawnSync(process.execPath, [script], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.notEqual(second.status, 0);
  assert.equal(readFileSync(path, 'utf8'), original);
  console.log(
    'Auth keys are independent, omitted from output and never overwritten',
  );
} finally {
  removeTemporaryKeys();
}

function removeTemporaryKeys() {
  const target = realpathSync(root);
  if (
    dirname(target) !== parent ||
    !basename(target).startsWith('collab-auth-')
  )
    throw new Error('Refusing to remove an unexpected test directory');
  rmSync(target, { recursive: true, force: true });
}
