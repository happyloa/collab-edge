import { existsSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
if (!existsSync('.dev.vars')) {
  writeFileSync(
    '.dev.vars',
    `SESSION_SECRET=${randomBytes(48).toString('base64url')}\nATTACHMENTS_ENABLED=true\nACCESS_REQUIRED=false\n`,
    { mode: 0o600 },
  );
  console.log(
    'Created .dev.vars with a random local secret. Its value is not displayed.',
  );
} else console.log('Existing .dev.vars preserved.');
