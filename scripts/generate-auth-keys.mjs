import { randomBytes } from 'node:crypto';
import { mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

const root = realpathSync(process.cwd());
mkdirSync(join(root, '.tools'), { recursive: true });
const tools = realpathSync(join(root, '.tools'));
if (dirname(tools) !== root || basename(tools) !== '.tools')
  throw new Error(
    'Refusing to store authentication keys outside project .tools',
  );
const path = join(tools, 'auth-keys.initial.json');
const secrets = {
  SESSION_SIGNING_KEY: randomBytes(48).toString('base64url'),
  PASSWORD_PEPPERS: JSON.stringify({
    p1: randomBytes(48).toString('base64url'),
  }),
};
writeFileSync(
  path,
  JSON.stringify({
    secrets: Object.fromEntries(
      Object.entries(secrets).map(([name, text]) => [
        name,
        { name, type: 'secret_text', text },
      ]),
    ),
  }),
  { flag: 'wx', mode: 0o600 },
);
console.log(
  'Created .tools/auth-keys.initial.json. Secret values are not displayed. Existing files are never overwritten.',
);
