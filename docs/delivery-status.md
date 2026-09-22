# Delivery status

Updated 2026-09-22. The Worker is deployed in a fail-closed private state. Owner sign-in, native GitHub Builds integration and authenticated production smoke tests are not complete.

- Repository: https://github.com/happyloa/collab-edge.
- Deployed URL: https://collab-edge.piafyoyo06.workers.dev. GitHub About Website is set to this URL.
- Worker version: `ab760c30-a30b-489d-8bdb-28144bd24e08`, deployed at 2026-09-22 04:24 UTC from code commit `dd4bfeb`.
- D1 `collab-edge-db`, APAC: `8f68d49a-be77-477d-aea1-04b6de4817a2`. All four migrations applied remotely.
- Private R2 `collab-edge-attachments`; production operations disabled.
- SQLite Durable Object exports `BoardRoom` and `AuthRateLimiter` created during deployment.
- Random production SESSION_SECRET stored on Cloudflare without logging its value.
- User explicitly confirmed Workers Free and requested owner-only access. No plan upgrade was requested or performed.
- Access JWT guard enabled; absent Access issuer/audience intentionally rejects everyone. Preview URLs disabled.
- Live checks: anonymous root and a session request with a forged owner email header both returned 403. No authenticated live application test is claimed.
- Local validation: 24 Workers/core tests, 3 React tests, ESLint probes, typecheck, format, production build and two Chromium scenarios passed. Vinext reports 100% compatibility.
- Commits remain separated by migration fix, access controls and delivery documentation. The README badge links to current GitHub CI.

## Authorization still required

The existing Wrangler OAuth can deploy Workers, D1 and secrets, but Access application creation and Workers Builds token lookup return 403. The GitHub Actions deploy token is also absent; its deploy gate remains false. Repository pushes are not yet connected to automatic Worker releases.

Complete the owner-only hostname Access application and native GitHub connection using [the exact configuration in deployment.md](deployment.md). Set the Access team domain and application audience in Wrangler, redeploy, and verify owner sign-in, denial of another email and live WebSocket collaboration. Do not disable the Access requirement to work around missing authorization.

## Migration compatibility

The first remote run applied schema and board lifecycle migrations but rolled back the safety trigger migration with `incomplete input`. A read-only inspection confirmed no partial trigger/table changes. Only the two unapplied migrations were rewritten with equivalent single-line triggers and `SELECT RAISE ... WHERE` instead of unparenthesized CASE expressions. The subsequent Wrangler remote migration run succeeded. Already applied remote migrations are immutable.

## Cost boundaries

Production has per-IP throttling, a persistent global dynamic-request budget, transactional write/storage quotas and disabled R2 operations. Workers Free is the platform billing boundary; application limits alone cannot guarantee a zero invoice on a paid/shared account. Keep Workers and any Access/Builds setup on free plans. Do not enable paid overages, preview deployments, production attachments or paid image optimization.
