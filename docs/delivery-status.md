# Delivery status

Updated 2026-09-23. The Worker is deployed behind owner-only Cloudflare Access and connected to native GitHub Builds. The native build, release and GitHub CI have succeeded. Authenticated production interaction still requires the owner to complete email verification; it is not claimed as tested automatically.

- Repository: https://github.com/happyloa/collab-edge.
- Deployed URL: https://collab-edge.piafyoyo06.workers.dev. GitHub About Website is set to this URL.
- Latest verified functional release: Worker version `3a53f646-1fbf-47b5-bfe2-7c2fa711b0e4`, deployed at 2026-09-22 12:47 UTC from commit `fa2b667`, including the initial color-theme toggle fix. This is a dated release record, not a moving pointer to every later maintenance deployment.
- D1 `collab-edge-db`, APAC: `8f68d49a-be77-477d-aea1-04b6de4817a2`. All four migrations applied remotely.
- Private R2 `collab-edge-attachments`; production operations disabled.
- SQLite Durable Object exports `BoardRoom` and `AuthRateLimiter` created during deployment.
- Random production SESSION_SECRET stored on Cloudflare without logging its value.
- User explicitly confirmed Workers Free and requested owner-only access. No plan upgrade was requested or performed.
- Hostname Access application `58261301-84d2-47ec-937f-a4d828aea306` covers the entire production hostname, with an eight-hour session and one allow policy for `piafyoyo06@gmail.com`. Its actual issuer and audience are deployed and the JWT guard remains enabled. Preview URLs disabled.
- Live checks: the production root redirects to `piafyoyo06.cloudflareaccess.com`; the login page returns 200 and provides email-code authentication. The Access policy and deployed bindings were read back and verified. No authenticated live application test is claimed.
- Validation: 24 Workers/core tests, 3 React tests, ESLint probes, typecheck, format and production build passed. All five Chromium scenarios passed in the release CI, including three theme regressions. Vinext reports 100% compatibility.
- Commits remain separated by migration fix, access controls and delivery documentation. The README badge links to current GitHub CI.
- Native Cloudflare build `cb7dac1e-bc5b-47cd-8346-9b445bd7a0e2` succeeded; its recorded source is `push_event`, branch `main`, commit `fa2b6671f32bd1911a4a81c5d7c1f130e5274014`. It ran full verification, checked remote migrations and deployed the Worker.
- Release GitHub CI succeeded: https://github.com/happyloa/collab-edge/actions/runs/35729148546.

## GitHub integration and remaining validation

The user-provided setup token resolved Access and Builds authorization. Repository connection `73c10708-51fc-4d7b-914b-2122b8713902` and production trigger `d5048a22-ca1a-4390-842a-01904be97a9a` connect `happyloa/collab-edge` to this Worker. Only `main` deploys. Pure docs, README and AGENTS changes are excluded to save build minutes. The obsolete disabled GitHub Actions deployment workflow has been removed; GitHub CI remains enabled.

The owner must complete Access email verification to validate authenticated production use, including live WebSocket collaboration. Browser automation runtime initialization failed in this session, so no authenticated screenshot or browser smoke is claimed. Local two-browser E2E remains passing. [Deployment configuration](deployment.md) records the live settings. Never disable Access to bypass the login requirement.

## Remaining product limits

Production attachments remain disabled. Member invitations add registered application accounts without sending email; the outer Access allowlist still admits only the owner. Password reset, application-account email verification, ownership transfer, account deletion and automatic event compaction are not implemented. The [branded verification email](email/README.md) includes HTML, plain text and desktop/mobile previews, but is not integrated into Access delivery.

All remote migrations are applied and immutable. Retain every migration and its metadata for fresh installations and future schema changes.

## Cost boundaries

Production has per-IP throttling, a persistent global dynamic-request budget, transactional write/storage quotas and disabled R2 operations. Workers Free is the platform billing boundary; application limits alone cannot guarantee a zero invoice on a paid/shared account. Keep Workers and any Access/Builds setup on free plans. Do not enable paid overages, preview deployments, production attachments or paid image optimization.
