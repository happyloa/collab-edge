import { writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
try {
  writeFileSync(
    '.dev.vars',
    `SESSION_SECRET=${randomBytes(48).toString('base64url')}\nATTACHMENTS_ENABLED=true\nACCESS_REQUIRED=false\n`,
    { flag: 'wx', mode: 0o600 },
  );
  console.log(
    'Created .dev.vars with a random local secret. Its value is not displayed.',
  );
} catch (error) {
  if (error?.code !== 'EEXIST') throw error;
  console.log('Existing .dev.vars preserved.');
}
