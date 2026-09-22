# Delivery status

Local implementation is verified; remote release is blocked by the zero-additional-cost requirement. This file records actual evidence rather than treating a local build as a live deployment.

- Official create-vinext-app scaffold created 2026-09-21.
- Current `vinext check`: 100% compatible (10 supported, no partial support or issues).
- Public repository: https://github.com/happyloa/collab-edge. Description and all requested topics configured.
- Cloudflare OAuth is available.
- D1 `collab-edge-db` created in APAC: `8f68d49a-be77-477d-aea1-04b6de4817a2`.
- Private R2 Standard bucket `collab-edge-attachments` created.
- No Worker deployed yet. No remote schema applied yet.
- Local D1 migrations 0000–0002 applied successfully.
- Auth, workspace RBAC, D1-atomic mutations, ordered WebSockets, idempotency, conflicts, replay, hibernation and private attachments implemented.
- 19 Workers/core tests and 3 React DOM tests pass, plus ESLint compatibility probes.
- Two-user Chromium collaboration scenario passes: synchronized moves/edits, conflict recovery, reconnect, comments, attachments and anonymous download rejection.
- Demo keyboard entry, mobile layout and dark theme test passes; actual screenshots are in docs/screenshots.
- Audit: no known vulnerabilities. Peer dependencies: no issues. TypeScript/Vitest compatibility pins are documented.
- Board renaming and archival synchronize across clients; archived boards are read-only and retain their quota usage. Local lifecycle migration applied successfully.
- Logical commits are created and verified separately as requested.
- GitHub CI passed for the initial delivery (`ac18748`): https://github.com/happyloa/collab-edge/actions/runs/35619120868. Subsequent changes run the same CI checks; the README badge reports the current branch result.

## Cost constraint

The owner requires no additional Cloudflare charges and application usage limits.
Do not upgrade account plans or activate paid products. Verify the Workers plan before deployment.
R2 free usage is account-wide and shared with existing buckets; application quotas alone cannot guarantee an account-wide zero invoice.
Keep production attachment operations disabled until available account budget can be established safely. Local R2 functionality and tests remain required.
Use hard server-side quotas and fail closed, rather than relying on billing notifications.

## Remaining remote delivery

1. Confirm the Cloudflare Workers billing plan is Free. Wrangler OAuth cannot read subscriptions (403); browser runtime initialization also failed, so no plan has been inferred.
2. Supply a scoped Cloudflare API token for GitHub Actions if automatic deployment is desired. The account ID secret is configured; the API token is not.
3. Once the zero-cost deployment conditions are satisfied: apply remote migrations, set a securely generated SESSION_SECRET, deploy, verify DO namespaces, capture the real URL and smoke-test live behavior.
4. Update README with the verified live URL and release evidence. Production attachments remain disabled until account-wide R2 free capacity is verified separately.

`CLOUDFLARE_DEPLOY_ENABLED` is explicitly false on GitHub. Local deploy additionally requires `CLOUDFLARE_FREE_PLAN_CONFIRMED=true`, no local .dev.vars, and production attachments disabled. A skipped deploy must not be reported as successful.
