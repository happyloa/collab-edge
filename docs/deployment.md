# Deployment

Worker URL: https://collab-edge.piafyoyo06.workers.dev. Owner-only hostname Access is configured, and the Worker is connected to GitHub native Builds. Remote D1 migrations, SESSION_SECRET and SQLite Durable Object namespaces are provisioned. See [delivery evidence](release-status.md).

## Private access configuration

The owner confirmed Workers Free and allowed access only for the owner email set in `ACCESS_ALLOWED_EMAIL` (`wrangler.jsonc`). An owner-supplied scoped setup token was used to create application `58261301-84d2-47ec-937f-a4d828aea306`, with an eight-hour session and one owner-email allow policy. The verified team domain is `piafyoyo06.cloudflareaccess.com`; its application AUD is recorded in Wrangler. The following steps describe this configuration for future maintenance. Never paste credentials into Git or chat; `.tools/` is ignored for temporary local credentials.

1. In Cloudflare Zero Trust, use the Free plan; do not select a paid plan. Configure the team domain and email one-time PIN authentication if not already enabled.
2. Under Access → Applications, add a **Self-hosted hostname** application for `collab-edge.piafyoyo06.workers.dev`, covering all paths. Do not select a Worker-level destination: Cloudflare currently documents that Worker-level Access rejects WebSockets.
3. Add one Allow policy with Include → Emails → the owner email. No Everyone or Bypass policy. Use an eight-hour session.
4. Copy the actual team hostname (`*.cloudflareaccess.com`) and application AUD tag into `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` in `wrangler.jsonc`. These are public verification identifiers. Keep `ACCESS_REQUIRED=true`, the owner email, attachments disabled and preview URLs disabled.
5. Redeploy and verify that anonymous visitors reach Access login, only the owner's verified email is admitted, and an authorized WebSocket works. Do not claim production collaboration is verified until this has been tested.

The application independently verifies the Access JWT signature, issuer, audience, expiration and owner email. Missing configuration fails closed. Framework static assets do not carry application data; the hostname Access policy additionally protects those at the edge.

Private registration must match the verified Access email. Password recovery uses that same signed identity and invalidates all app sessions; it does not provision an email sender or require new storage bindings. Existing app accounts with a different email may sign in and explicitly adopt the verified address. Demo accounts are excluded. Keep the Access allow policy owner-only and `ACCESS_REQUIRED=true`; otherwise recovery remains unavailable.

References: [Workers Access and WebSocket limitations](https://developers.cloudflare.com/workers/configuration/cloudflare-access/), [JWT validation](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/).

## GitHub connection

Native Workers Builds is connected to `happyloa/collab-edge`, with production trigger `d5048a22-ca1a-4390-842a-01904be97a9a`. Pushes to `main` initiate builds automatically; no preview trigger was created. GitHub CI runs separately. The following settings are configured in Cloudflare.

Pure changes to `docs/**`, `README.md`, `README.en.md` and `AGENTS.md` do not trigger a Cloudflare build, saving free build minutes. Every other `main` push runs the native verification, applies remote migrations and deploys. This does not wait for GitHub CI or the browser suite, so run `pnpm test:e2e` before pushing to `main`. Node 24.12.0 and pnpm 12.5.1 are configured as build variables.

In Workers & Pages → `collab-edge` → Settings → Builds → Connect, authorize the Cloudflare GitHub App only for `happyloa/collab-edge` and configure:

| Setting                       | Value                                                                                                       |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Production branch             | `main`                                                                                                      |
| Root directory                | `/`                                                                                                         |
| Build command                 | `corepack pnpm install --frozen-lockfile && corepack pnpm audit --audit-level high && corepack pnpm verify` |
| Deploy command                | `node scripts/check-deploy-budget.mjs && corepack pnpm db:migrate:remote && corepack pnpm run deploy`       |
| Build variable                | `CLOUDFLARE_FREE_PLAN_CONFIRMED=true`                                                                       |
| Non-production/preview builds | Disabled                                                                                                    |

Use a build token scoped to this account's Workers Scripts, D1 and required bindings; never use a Global API Key. Keep Builds on the Free allowance and disable paid overages. Verify an actual successful build after connecting. Do not enable both native Builds and GitHub Actions deployments for the same branch.

Native Builds checks the high-severity audit before building. An unhandled advisory or failed audit request stops deployment independently of GitHub CI. The named, patched braces exception remains in the repository audit configuration; new advisories are not automatically ignored.

The obsolete, disabled GitHub Actions Worker deployment workflow, its two repository deployment variables and its account-ID secret have been removed. GitHub Actions runs app CI and the separate static GitHub Pages demo deployment; native Builds retains its own Worker deploy token and Free-plan build variable in Cloudflare. See [public demo](public-demo.md) for the independent browser-only artifact.

References: [GitHub integration](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/github-integration/), [Builds API permissions and setup](https://developers.cloudflare.com/workers/ci-cd/builds/api-reference/), [Builds limits and pricing](https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/).

## Subsequent authorized releases

Run `pnpm verify` and `pnpm test:e2e` locally. Move `.dev.vars` outside the repository root while releasing, then restore it afterward; never overwrite or commit it. Set `CLOUDFLARE_FREE_PLAN_CONFIRMED=true` only while the verified account remains Free.

```sh
node scripts/check-deploy-budget.mjs
pnpm db:migrate:remote
pnpm run deploy
```

The deploy script validates private Access enforcement, disabled previews, the rate-limit binding and disabled production R2, then uses the official Vinext Cloudflare adapter to build and deploy. Production secrets are already stored on Cloudflare and are not needed for static build analysis. Missing local SESSION_SECRET warnings during release build do not erase the remote secret.

Applied migrations are append-only. Never reset remote D1 or upgrade billing to bypass a demo quota.

## Rollback and recovery

- **Bad Worker release:** `pnpm exec wrangler deployments list`, then `pnpm exec wrangler rollback <version-id>`. Check schema compatibility first: an older Worker must still work with every migration already applied.
- **Before a risky migration:** export the database with `pnpm exec wrangler d1 export collab-edge-db --remote --output=backup.sql` and keep the file outside the repository.
- **Bad data or a failed migration:** D1 Time Travel can restore the database to an earlier minute: `pnpm exec wrangler d1 time-travel restore collab-edge-db --timestamp=<ISO time>`. Restoring rewinds all writes after that time, so prefer a forward fix migration when only a few rows are wrong. Never edit or delete an applied migration file.
- **Lifetime quotas exhausted:** the site-wide event, event-byte and per-board change counters in the `quotas` table do not reset by design. Raising them is a deliberate schema change, not an operational switch.

The event-retention release adds columns and an index in [migration 0006](../drizzle/0006_lean_harrier.sql). Applying it does not compact existing event payloads; owners must review and confirm that separately. Restore now inserts events with explicit column names. Older code that uses positional `INSERT INTO board_events VALUES(...)` is incompatible with the added column, so a code rollback must retain the [restore compatibility fix](../src/backups/restore.ts). Do not rewrite or remove the applied migration to work around that incompatibility.

## Production smoke check

Production is restricted to the owner's Cloudflare Access email, so only the owner can run these checks in a browser. Never disable Access or share a session cookie to automate them. Record a check as done only after observing it, with the commit and build ID, in [release status](release-status.md).

Without signing in: the anonymous Worker URL redirects to Access (302); the Access policy still allows only the owner email; the Worker keeps `ACCESS_REQUIRED=true`, `ATTACHMENTS_ENABLED=false` and disabled preview URLs; Cloudflare Builds and GitHub Actions succeeded for the release commit; the [public playground](https://happyloa.github.io/collab-edge/) loads.

After passing Access as the owner:

1. Sign in (or use the Alice demo account). The workspace and board load and the status becomes Connected.
2. On a disposable board, create a card, assign a member and a due date, reload and confirm both persist. Search and filter it, archive and restore it, then archive and restore the board.
3. In a second independent browser context (same owner email for Access), sign in as Bob or a second app account and verify live sync, a conflicting edit with retry, and reconnect. Do not widen the Access allowlist for this.
4. Open **Activity → Manage history** on a new board; it should report nothing to clear. Do not clear real production activity just to test it.
5. Ownership transfer, password reset and account deletion change real accounts. Run them only on disposable accounts you control; otherwise record them as pending.

Never run the local end-to-end suite against production: it uploads files, and production attachments are disabled.
