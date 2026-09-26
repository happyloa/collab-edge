import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const stateParent = join(root, '.wrangler');
const captureDemo = process.argv.slice(2).includes('--capture-demo');
if (captureDemo && process.env.E2E_BASE_URL)
  throw new Error('Demo recording must use isolated local workerd state');
const playwrightCommand = captureDemo
  ? 'corepack pnpm exec playwright test e2e/collaboration.spec.ts'
  : 'corepack pnpm exec playwright test';
let activeChild;

function run(command, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      cwd: root,
      env,
      shell: true,
      stdio: 'inherit',
    });
    activeChild = child;
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      activeChild = undefined;
      if (code === 0) resolve();
      else reject(new Error(`${command} failed (${signal ?? code})`));
    });
  });
}

function availablePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close((error) => {
        if (error) reject(error);
        else if (address && typeof address !== 'string') resolve(address.port);
        else reject(new Error('Could not reserve a local E2E port'));
      });
    });
  });
}

async function removeTemporaryState(path) {
  const parent = await realpath(stateParent);
  const target = await realpath(path);
  if (
    dirname(target).toLowerCase() !== parent.toLowerCase() ||
    !/^e2e-[a-zA-Z0-9_-]+$/.test(basename(target))
  ) {
    throw new Error(
      'Refusing to remove a path outside the temporary E2E state',
    );
  }
  await rm(target, {
    recursive: true,
    force: true,
    maxRetries: 8,
    retryDelay: 250,
  });
}

const interrupt = () => activeChild?.kill('SIGINT');
const terminate = () => activeChild?.kill('SIGTERM');
process.on('SIGINT', interrupt);
process.on('SIGTERM', terminate);

let statePath;
try {
  if (process.env.E2E_BASE_URL) {
    await run(playwrightCommand, process.env);
  } else {
    await mkdir(stateParent, { recursive: true });
    statePath = await mkdtemp(join(stateParent, 'e2e-'));
    const stateName = basename(statePath);
    if (!/^e2e-[a-zA-Z0-9_-]+$/.test(stateName))
      throw new Error('Invalid temporary E2E state name');
    const env = {
      ...process.env,
      COLLABEDGE_E2E_STATE_PATH: statePath,
      COLLABEDGE_E2E_PORT: String(await availablePort()),
      COLLABEDGE_CAPTURE_DEMO: captureDemo ? '1' : undefined,
    };
    await run(
      `corepack pnpm exec wrangler d1 migrations apply DB --local --persist-to .wrangler/${stateName}`,
      env,
    );
    await run(playwrightCommand, env);
  }
} finally {
  process.off('SIGINT', interrupt);
  process.off('SIGTERM', terminate);
  if (statePath) await removeTemporaryState(statePath);
}
