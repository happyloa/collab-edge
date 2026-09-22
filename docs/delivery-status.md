# Delivery status

Updated 2026-09-22. The Worker is deployed behind owner-only Cloudflare Access and connected to native GitHub Builds. The native build, release and GitHub CI have succeeded. Authenticated production interaction still requires the owner to complete email verification; it is not claimed as tested automatically.

- Repository: https://github.com/happyloa/collab-edge.
- Deployed URL: https://collab-edge.piafyoyo06.workers.dev. GitHub About Website is set to this URL.
- Verified Worker version: `95b89bc5-eaf9-46bc-a008-41e9c73e8438`, deployed at 2026-09-22 12:03 UTC from code commit `a5363fd`.
- D1 `collab-edge-db`, APAC: `8f68d49a-be77-477d-aea1-04b6de4817a2`. All four migrations applied remotely.
- Private R2 `collab-edge-attachments`; production operations disabled.
- SQLite Durable Object exports `BoardRoom` and `AuthRateLimiter` created during deployment.
- Random production SESSION_SECRET stored on Cloudflare without logging its value.
- User explicitly confirmed Workers Free and requested owner-only access. No plan upgrade was requested or performed.
- Hostname Access application `58261301-84d2-47ec-937f-a4d828aea306` covers the entire production hostname, with an eight-hour session and one allow policy for `piafyoyo06@gmail.com`. Its actual issuer and audience are deployed and the JWT guard remains enabled. Preview URLs disabled.
- Live checks: the production root redirects to `piafyoyo06.cloudflareaccess.com`; the login page returns 200 and provides email-code authentication. The Access policy and deployed bindings were read back and verified. No authenticated live application test is claimed.
- Local validation: 24 Workers/core tests, 3 React tests, ESLint probes, typecheck, format, production build and two Chromium scenarios passed. Vinext reports 100% compatibility.
- Commits remain separated by migration fix, access controls and delivery documentation. The README badge links to current GitHub CI.
- Native Cloudflare build `0afeed68-1ea5-4f08-b1fc-56ff77b9e922` succeeded; its recorded source is `push_event`, branch `main`, commit `a5363fd3b30f18879bd86e7e348f35d397c4d3e2`. It ran full verification, checked remote migrations and deployed the Worker.
- Release GitHub CI succeeded: https://github.com/happyloa/collab-edge/actions/runs/35724759632.

## GitHub integration and remaining validation

The user-provided setup token resolved Access and Builds authorization. Repository connection `73c10708-51fc-4d7b-914b-2122b8713902` and production trigger `d5048a22-ca1a-4390-842a-01904be97a9a` connect `happyloa/collab-edge` to this Worker. Only `main` deploys. Pure docs, README and AGENTS changes are excluded to save build minutes. GitHub Actions deployment remains disabled intentionally, preventing two deployment systems from racing; GitHub CI remains enabled.

The owner must complete Access email verification to validate authenticated production use, including live WebSocket collaboration. Browser automation runtime initialization failed in this session, so no authenticated screenshot or browser smoke is claimed. Local two-browser E2E remains passing. [Deployment configuration](deployment.md) records the live settings. Never disable Access to bypass the login requirement.

## Migration compatibility

The first remote run applied schema and board lifecycle migrations but rolled back the safety trigger migration with `incomplete input`. A read-only inspection confirmed no partial trigger/table changes. Only the two unapplied migrations were rewritten with equivalent single-line triggers and `SELECT RAISE ... WHERE` instead of unparenthesized CASE expressions. The subsequent Wrangler remote migration run succeeded. Already applied remote migrations are immutable.

## Cost boundaries

Production has per-IP throttling, a persistent global dynamic-request budget, transactional write/storage quotas and disabled R2 operations. Workers Free is the platform billing boundary; application limits alone cannot guarantee a zero invoice on a paid/shared account. Keep Workers and any Access/Builds setup on free plans. Do not enable paid overages, preview deployments, production attachments or paid image optimization.
