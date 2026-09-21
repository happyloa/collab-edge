# Deployment

Status: not deployed. The public GitHub repository exists. D1 `collab-edge-db` (APAC) and private Standard R2 bucket `collab-edge-attachments` exist; their configuration uses actual provisioned identifiers. Remote schema, runtime secret, Durable Object namespaces and live application validation remain pending the zero-cost deployment gate.

## Cost gate

The owner requires no additional charges. Never enable Workers Paid or other paid services. Confirm Workers Free before the first deployment. The existing Wrangler OAuth credential can manage resources but the account subscriptions API returned 403, so billing-plan verification is not complete. Production R2 remains disabled because its account-wide remaining free allowance has not been established. The account already has another R2 bucket.

GitHub deployment requires repository variables `CLOUDFLARE_DEPLOY_ENABLED=true` and `CLOUDFLARE_FREE_PLAN_CONFIRMED=true`, only after the plan is verified, plus `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets. The account ID is configured; the scoped API token is still missing. Until then the deployment job is deliberately skipped. A skipped deployment is not a successful release.

## Reproduce infrastructure

```sh
pnpm exec wrangler login
pnpm exec wrangler whoami
pnpm exec wrangler d1 list
# Create only when absent; update wrangler.jsonc with the returned real ID.
pnpm exec wrangler d1 create collab-edge-db --location=apac
pnpm exec wrangler d1 info collab-edge-db
pnpm exec wrangler r2 bucket create collab-edge-attachments
pnpm exec wrangler r2 bucket list
pnpm cf:typegen
```

BoardRoom and AuthRateLimiter use SQLite-backed declarative `exports`, not legacy DO migrations. Namespaces are provisioned during deployment.

## Authorized release

After plan verification, generate SESSION_SECRET with a secure random generator and submit it through Wrangler's stdin or interactive prompt. Do not place it in command arguments, logs or Git. Set `CLOUDFLARE_FREE_PLAN_CONFIRMED=true` in the release shell only after verification, and move the local .dev.vars out of the repository directory before release. The deploy script intentionally refuses local development secrets because they enable local R2.

```sh
pnpm verify
pnpm test:e2e
pnpm exec wrangler d1 migrations list DB --remote
pnpm db:migrate:remote
pnpm exec wrangler secret put SESSION_SECRET
pnpm exec wrangler secret list
pnpm run deploy
```

The official scaffold uses `vinext-cloudflare deploy --config dist/server/wrangler.json`. It validates the Vite Cloudflare setup, builds and deploys. Capture the actual returned workers.dev URL; never predict it. Smoke-test registration/login, two-user collaboration, permissions, replay and configured attachment behavior before adding the URL to README.

For CI, scope the API token to this account with Account Workers Scripts Edit, D1 Edit, Workers R2 Storage Edit, and Account Settings Read as required by Wrangler. Do not use a Global API Key. Add any further permission only when a concrete API error requires it. GitHub runtime deployment secrets differ from SESSION_SECRET, which lives on Cloudflare.

Rollback Worker code with Wrangler versions/rollback only after considering schema compatibility. Applied remote migrations are append-only. Never use drizzle-kit push in production. Monitor Worker errors and quota failures; do not respond to a demo quota by enabling billing automatically.
