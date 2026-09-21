import { readFileSync, existsSync } from 'node:fs';
if (process.env.CLOUDFLARE_FREE_PLAN_CONFIRMED !== 'true') {
  throw new Error(
    'Deployment blocked: verify Workers Free, then explicitly set CLOUDFLARE_FREE_PLAN_CONFIRMED=true. Application quotas do not prevent paid-plan request charges.',
  );
}
if (existsSync('.dev.vars')) {
  throw new Error(
    'Deployment blocked: move .dev.vars out of the project for the release. It enables local attachments and must not affect a production build.',
  );
}
const config = JSON.parse(readFileSync('dist/server/wrangler.json', 'utf8'));
if (config.vars?.ATTACHMENTS_ENABLED !== 'false') {
  throw new Error(
    'Deployment blocked: production R2 must remain disabled under the zero-cost policy.',
  );
}
console.log(
  'Zero-cost deployment prerequisites acknowledged; production attachments remain disabled.',
);
