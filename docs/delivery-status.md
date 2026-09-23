# Delivery status

Updated 2026-09-23. The Worker is deployed behind owner-only Cloudflare Access and connected to native GitHub Builds. The feature release, remote D1 migration and GitHub CI have succeeded. Authenticated production interaction still requires the owner to complete email verification; it is not claimed as tested automatically.

- Repository: https://github.com/happyloa/collab-edge.
- Deployed URL: https://collab-edge.piafyoyo06.workers.dev. GitHub About Website is set to this URL.
- Public browser-only demo: https://happyloa.github.io/collab-edge/. [Pages workflow](https://github.com/happyloa/collab-edge/actions/runs/35864445244) succeeded for `78322b0`. The published HTML and self-hosted font returned 200; the local demo scenario confirmed edit/conflict recovery, restore, reset, language persistence, mobile layout and no API/WebSocket requests. No claim of browser interaction with the hosted copy is made.
- Latest release: Worker version `fc3bdc5a-1647-4cc3-a3d2-40d95eb31f6b`, deployed at 2026-09-23 13:04 UTC from commit `78322b0`. It includes task assignees, due dates, filters and archive/restore. The separate browser-only demo was built from the same commit. The native Worker build succeeded and its anonymous Access response was checked; authenticated live app behavior has not been smoke-tested.
- D1 `collab-edge-db`, APAC: `8f68d49a-be77-477d-aea1-04b6de4817a2`. The new append-only `0002_task_metadata.sql` migration applied remotely; `wrangler d1 migrations list DB --remote` reports no pending migrations.
- Private R2 `collab-edge-attachments`; production operations disabled.
- SQLite Durable Object exports `BoardRoom` and `AuthRateLimiter` created during deployment.
- Random production SESSION_SECRET stored on Cloudflare without logging its value.
- User explicitly confirmed Workers Free and requested owner-only access. No plan upgrade was requested or performed.
- Hostname Access application `58261301-84d2-47ec-937f-a4d828aea306` covers the entire production hostname, with an eight-hour session and one allow policy for `piafyoyo06@gmail.com`. Its actual issuer and audience are deployed and the JWT guard remains enabled. Preview URLs disabled.
- Live checks: the production root redirects to `piafyoyo06.cloudflareaccess.com`; the login page returns 200 and provides email-code authentication. The Access policy and deployed bindings were read back and verified. No authenticated live application test is claimed.
- Validation: 26 Workers/core tests, 3 React tests, ESLint probes, typecheck, format, app production build and static demo build passed. All seven app Chromium scenarios and the separate demo Chromium scenario passed locally and in their respective release CI workflows. Vinext reports 100% compatibility.
- Application changes and static-demo changes were committed separately. The README badge links to current GitHub CI.
- Native Cloudflare build `a87594a7-f80b-4ca6-9757-43e26bdcdde7` succeeded for `78322b008233692cfed1f757e466e98ad5fee0dc`. It ran verification, applied remote migrations and deployed the Worker. The anonymous homepage returns an Access redirect (302). Readback confirms `ACCESS_REQUIRED=true`, `ATTACHMENTS_ENABLED=false` and the Access allow policy still contains only `piafyoyo06@gmail.com`.
- Release GitHub CI succeeded: https://github.com/happyloa/collab-edge/actions/runs/35864445173.
- The [Chinese README](../README.zh-TW.md) and [i18n guide](i18n.md) document language persistence, server rendering and untranslated user content. The app's language selector does not customize Cloudflare-managed login pages or OTP emails.

## GitHub integration and remaining validation

The user-provided setup token resolved Access and Builds authorization. Repository connection `73c10708-51fc-4d7b-914b-2122b8713902` and production trigger `d5048a22-ca1a-4390-842a-01904be97a9a` connect `happyloa/collab-edge` to this Worker. Only `main` deploys. Pure docs, README and AGENTS changes are excluded to save build minutes. The obsolete disabled GitHub Actions Worker deployment workflow has been removed; GitHub CI and the separate static Pages workflow remain enabled.

The owner must complete Access email verification to validate authenticated production use, including live WebSocket collaboration. The browser tool reported no available browser in this session, so no authenticated screenshot or browser smoke is claimed. Local two-browser E2E remains passing. [Production smoke steps](production-smoke.md) and [deployment configuration](deployment.md) record the remaining work. Never disable Access to bypass the login requirement.

## Remaining product limits

Production attachments remain disabled. Member invitations add registered application accounts without sending email; the outer Access allowlist still admits only the owner. Password reset, application-account email verification, ownership transfer, account deletion and automatic event compaction are not implemented. The [branded verification email](email/README.md) includes HTML, plain text and desktop/mobile previews, but is not integrated into Access delivery.

All remote migrations are applied and immutable. Retain every migration and its metadata for fresh installations and future schema changes.

## Cost boundaries

Production has per-IP throttling, a persistent global dynamic-request budget, transactional write/storage quotas and disabled R2 operations. Workers Free is the platform billing boundary; application limits alone cannot guarantee a zero invoice on a paid/shared account. Keep Workers and any Access/Builds setup on free plans. Do not enable paid overages, preview deployments, production attachments or paid image optimization.
