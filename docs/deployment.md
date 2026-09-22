# Deployment

Worker URL: https://collab-edge.piafyoyo06.workers.dev. It currently returns 403 for dynamic routes because owner-only Access configuration is pending. Remote D1 migrations, SESSION_SECRET and SQLite Durable Object namespaces are provisioned. See [delivery evidence](delivery-status.md).

## Finish private access

The user confirmed Workers Free and selected access only for `piafyoyo06@gmail.com`. Existing Wrangler OAuth cannot create Access applications (403). Complete this with a suitably authorized account or scoped API token. Never paste credentials into Git or chat; `.tools/` is ignored for temporary local credentials.

1. In Cloudflare Zero Trust, use the Free plan; do not select a paid plan. Configure the team domain and email one-time PIN authentication if not already enabled.
2. Under Access → Applications, add a **Self-hosted hostname** application for `collab-edge.piafyoyo06.workers.dev`, covering all paths. Do not select a Worker-level destination: Cloudflare currently documents that Worker-level Access rejects WebSockets.
3. Add one Allow policy with Include → Emails → `piafyoyo06@gmail.com`. No Everyone or Bypass policy. Use an eight-hour session.
4. Copy the actual team hostname (`*.cloudflareaccess.com`) and application AUD tag into `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` in `wrangler.jsonc`. These are public verification identifiers. Keep `ACCESS_REQUIRED=true`, the owner email, attachments disabled and preview URLs disabled.
5. Redeploy and verify that anonymous visitors reach Access login, only the owner's verified email is admitted, and an authorized WebSocket works. Do not claim production collaboration is verified until this has been tested.

The application independently verifies the Access JWT signature, issuer, audience, expiration and owner email. Missing configuration fails closed. Framework static assets do not carry application data; the hostname Access policy additionally protects those at the edge.

References: [Workers Access and WebSocket limitations](https://developers.cloudflare.com/workers/configuration/cloudflare-access/), [JWT validation](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/).

## Connect the Worker to GitHub

The repository exists and GitHub CI runs on pushes. **The native Workers Builds connection is not yet established**: its API rejects the existing OAuth with 403. A repository homepage link is not a build connection.

In Workers & Pages → `collab-edge` → Settings → Builds → Connect, authorize the Cloudflare GitHub App only for `happyloa/collab-edge` and configure:

| Setting                       | Value                                                                                                 |
| ----------------------------- | ----------------------------------------------------------------------------------------------------- |
| Production branch             | `main`                                                                                                |
| Root directory                | `/`                                                                                                   |
| Build command                 | `corepack pnpm install --frozen-lockfile && corepack pnpm build`                                      |
| Deploy command                | `node scripts/check-deploy-budget.mjs && corepack pnpm db:migrate:remote && corepack pnpm run deploy` |
| Build variable                | `CLOUDFLARE_FREE_PLAN_CONFIRMED=true`                                                                 |
| Non-production/preview builds | Disabled                                                                                              |

Use a build token scoped to this account's Workers Scripts, D1 and required bindings; never use a Global API Key. Keep Builds on the Free allowance and disable paid overages. Verify an actual successful build after connecting. Do not enable both native Builds and GitHub Actions deployments for the same branch.

The GitHub Actions alternative is already defined but disabled with `CLOUDFLARE_DEPLOY_ENABLED=false`; `CLOUDFLARE_ACCOUNT_ID` and the Free-plan variable are configured, while `CLOUDFLARE_API_TOKEN` is absent. Native Builds uses its own deploy token and does not need that GitHub secret.

References: [GitHub integration](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/github-integration/), [Builds API permissions and setup](https://developers.cloudflare.com/workers/ci-cd/builds/api-reference/), [Builds limits and pricing](https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/).

## Subsequent authorized releases

Run `pnpm verify` and `pnpm test:e2e` locally. Move `.dev.vars` outside the repository root while releasing, then restore it afterward; never overwrite or commit it. Set `CLOUDFLARE_FREE_PLAN_CONFIRMED=true` only while the verified account remains Free.

```sh
node scripts/check-deploy-budget.mjs
pnpm db:migrate:remote
pnpm run deploy
```

The deploy script validates private Access enforcement, disabled previews, the rate-limit binding and disabled production R2, then uses the official Vinext Cloudflare adapter to build and deploy. Production secrets are already stored on Cloudflare and are not needed for static build analysis. Missing local SESSION_SECRET warnings during release build do not erase the remote secret.

Applied migrations are append-only. Consider schema compatibility before using Wrangler rollback. Never reset remote D1 or upgrade billing to bypass a demo quota.
