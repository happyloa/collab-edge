# Delivery status

Updated 2026-09-24. The Worker is deployed behind owner-only Cloudflare Access and connected to native GitHub Builds. Account recovery is released; remote authentication interaction still requires the owner to complete Access email verification and is not claimed as tested automatically.

## Current account-recovery release

- Commits: `5aded5d` (Access-backed registration, verified-email adoption, password reset and tests), `dbdd88d` (bilingual and security documentation), `e0fe67f` (explicit local test Access setting). The first Cloudflare build for `dbdd88d` failed because its secret-free test environment inherited production `ACCESS_REQUIRED=true`; the fix was verified without `.dev.vars` and the subsequent release succeeded.
- Native Cloudflare build `4a7a446b-1219-4c80-8959-42532b5e925c` succeeded for `e0fe67f3a49176e7153c5af862bf44d97c8d9b65`. Worker version `77e28bab-1bbf-4617-9ea7-31f166eae7b5` deployed at 2026-09-24 03:53 UTC. The build log records the budget gate, upload and successful deploy. [GitHub CI](https://github.com/happyloa/collab-edge/actions/runs/35953220516) and [public demo workflow](https://github.com/happyloa/collab-edge/actions/runs/35953220530) succeeded for the same commit.
- Local validation: `pnpm verify` passed with 30 Workers/core tests, 3 React tests, strict typecheck, lint, formatting and production build; `pnpm test:e2e` passed all 11 Chromium scenarios. The Workers suite also passed with `.dev.vars` absent, matching Cloudflare Builds. No new D1 migration, paid email sender or production R2 operation was added.
- Post-deployment readback: `ACCESS_REQUIRED=true`, `ACCESS_ALLOWED_EMAIL=piafyoyo06@gmail.com`, `ATTACHMENTS_ENABLED=false`, `REGISTRATION_ENABLED=true`; anonymous Worker root returns 302 to Access and public demo returns 200. The user previously confirmed Workers Free; this token cannot read the billing plan. Production authenticated registration, password reset and WebSocket smoke remain unverified because the browser connection was unavailable and the owner Access code was not completed here.

- Repository: https://github.com/happyloa/collab-edge.
- Deployed URL: https://collab-edge.piafyoyo06.workers.dev. GitHub About Website is set to this URL.
- Public browser-only demo: https://happyloa.github.io/collab-edge/. [Pages workflow](https://github.com/happyloa/collab-edge/actions/runs/35867978579) succeeded for `9d71b1b`. The published HTML returned 200; the local demo scenario confirmed edit/conflict recovery, restore, reset, language persistence, mobile layout and no API/WebSocket requests. No claim of browser interaction with the hosted copy is made.
- Previous GSAP home release: Worker version `27db6c84-ebf5-4a5f-b285-362f25ed99de`, deployed at 2026-09-23 18:49 UTC from commit `c6c1eee`. Native build `182b37b6-7dad-4155-bc11-55b84656026a` succeeded. [GitHub CI](https://github.com/happyloa/collab-edge/actions/runs/35904933133) and [public demo workflow](https://github.com/happyloa/collab-edge/actions/runs/35904933250) succeeded for the same commit.
- Previous motion release: Worker version `245564d4-4476-49ef-95b2-0beba629b2f7`, deployed at 2026-09-23 13:35 UTC from commit `9d71b1b`. Native build `f96eb54b-b854-41ba-87e7-549e4c4bfb55` succeeded. Page, button, card and dialog motion is disabled for reduced-motion preference; hover styling does not move drag targets. The public demo was published from the same commit.
- Feature release: Worker version `fc3bdc5a-1647-4cc3-a3d2-40d95eb31f6b`, deployed at 2026-09-23 13:04 UTC from commit `78322b0`. It includes task assignees, due dates, filters and archive/restore. The separate browser-only demo was built from the same commit. A documentation-only follow-up at commit `2655a8a` triggered another successful native build `a7d6febe-7671-401f-a723-1b4b20ba6db7` and Worker version `6be8e16b-e1fd-4cd9-9d73-215a643f39cb` at 13:10 UTC. No authenticated live app smoke is claimed.
- D1 `collab-edge-db`, APAC: `8f68d49a-be77-477d-aea1-04b6de4817a2`. The new append-only `0002_task_metadata.sql` migration applied remotely; `wrangler d1 migrations list DB --remote` reports no pending migrations.
- Private R2 `collab-edge-attachments`; production operations disabled.
- SQLite Durable Object exports `BoardRoom` and `AuthRateLimiter` created during deployment.
- Random production SESSION_SECRET stored on Cloudflare without logging its value.
- User explicitly confirmed Workers Free and requested owner-only access. No plan upgrade was requested or performed.
- Hostname Access application `58261301-84d2-47ec-937f-a4d828aea306` covers the entire production hostname, with an eight-hour session and one allow policy for `piafyoyo06@gmail.com`. Its actual issuer and audience are deployed and the JWT guard remains enabled. Preview URLs disabled.
- Live checks: the production root redirects to `piafyoyo06.cloudflareaccess.com`; the login page returns 200 and provides email-code authentication. The Access policy and deployed bindings were read back and verified. No authenticated live application test is claimed.
- Previous release validation: 26 Workers/core tests, 3 React tests, ESLint probes, typecheck, format, app production build and static demo build passed. Ten app Chromium scenarios and the separate demo Chromium scenario passed locally and in their respective release CI workflows. The GSAP scenarios verify responsive layout, reduced-motion opt-out, language switching, scroll reveals and drag-safe card hover. Current validation is recorded above.
- Motion code and its browser coverage were committed separately from the bilingual documentation and finished screenshot previews. The README badge links to current GitHub CI.
- The initial task-metadata Cloudflare build `a87594a7-f80b-4ca6-9757-43e26bdcdde7` succeeded for `78322b008233692cfed1f757e466e98ad5fee0dc`. It ran verification, applied remote migrations and deployed the Worker. Following the motion release, readback again confirmed `ACCESS_REQUIRED=true`, `ATTACHMENTS_ENABLED=false` and the allowed email remained `piafyoyo06@gmail.com`.
- Release GitHub CI succeeded: https://github.com/happyloa/collab-edge/actions/runs/35867978685.
- The [Chinese README](../README.zh-TW.md) and [i18n guide](i18n.md) document language persistence, server rendering and untranslated user content. The app's language selector does not customize Cloudflare-managed login pages or OTP emails.

## GitHub integration and remaining validation

The user-provided setup token resolved Access and Builds authorization. Repository connection `73c10708-51fc-4d7b-914b-2122b8713902` and production trigger `d5048a22-ca1a-4390-842a-01904be97a9a` connect `happyloa/collab-edge` to this Worker. Only `main` deploys. The trigger now excludes `docs/**`, both README files, `AGENTS.md`, `showcase/*` and the static Pages workflow path to save Workers Free build minutes on changes unrelated to the Worker. The `2655a8a` build started before this filter correction. The obsolete disabled GitHub Actions Worker deployment workflow has been removed; GitHub CI and the separate static Pages workflow remain enabled.

The owner must complete Access email verification to validate authenticated production use, including live WebSocket collaboration. The browser tool reported no available browser in this session, so no authenticated screenshot or browser smoke is claimed. Local two-browser E2E remains passing. [Production smoke steps](production-smoke.md) and [deployment configuration](deployment.md) record the remaining work. Never disable Access to bypass the login requirement.

## Remaining product limits

Production attachments remain disabled. Member invitations add registered application accounts without sending email; the outer Access allowlist still admits only the owner. New private registrations bind the account to the Access-verified email; existing accounts can explicitly adopt that email, and password reset revokes old sessions. The active Access session suffices for reset; there is no fresh app-specific code. Ownership transfer, account deletion and automatic event compaction are not implemented. The [branded verification email](email/README.md) includes HTML, plain text and desktop/mobile previews, but is not integrated into Access delivery.

All remote migrations are applied and immutable. Retain every migration and its metadata for fresh installations and future schema changes.

## Cost boundaries

Production has per-IP throttling, a persistent global dynamic-request budget, transactional write/storage quotas and disabled R2 operations. Workers Free is the platform billing boundary; application limits alone cannot guarantee a zero invoice on a paid/shared account. Keep Workers and any Access/Builds setup on free plans. Do not enable paid overages, preview deployments, production attachments or paid image optimization.
