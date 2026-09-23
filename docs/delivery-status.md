# Delivery status

Updated 2026-09-23. The Worker is deployed behind owner-only Cloudflare Access and connected to native GitHub Builds. The native build, release and GitHub CI have succeeded. Authenticated production interaction still requires the owner to complete email verification; it is not claimed as tested automatically.

- Repository: https://github.com/happyloa/collab-edge.
- Deployed URL: https://collab-edge.piafyoyo06.workers.dev. GitHub About Website is set to this URL.
- Latest verified functional release: Worker version `9135dc9d-307d-4657-b41d-9a63073fc6f4`, deployed at 2026-09-23 04:14 UTC from commit `dc3c6c4`, including persistent English/Traditional Chinese UI and the initial color-theme toggle fix. This is a dated release record, not a moving pointer to every later maintenance deployment.
- D1 `collab-edge-db`, APAC: `8f68d49a-be77-477d-aea1-04b6de4817a2`. All four migrations applied remotely.
- Private R2 `collab-edge-attachments`; production operations disabled.
- SQLite Durable Object exports `BoardRoom` and `AuthRateLimiter` created during deployment.
- Random production SESSION_SECRET stored on Cloudflare without logging its value.
- User explicitly confirmed Workers Free and requested owner-only access. No plan upgrade was requested or performed.
- Hostname Access application `58261301-84d2-47ec-937f-a4d828aea306` covers the entire production hostname, with an eight-hour session and one allow policy for `piafyoyo06@gmail.com`. Its actual issuer and audience are deployed and the JWT guard remains enabled. Preview URLs disabled.
- Live checks: the production root redirects to `piafyoyo06.cloudflareaccess.com`; the login page returns 200 and provides email-code authentication. The Access policy and deployed bindings were read back and verified. No authenticated live application test is claimed.
- Validation: 24 Workers/core tests, 3 React tests, ESLint probes, typecheck, format and production build passed. All seven Chromium scenarios passed in the release CI, including three theme and two language scenarios. Vinext reports 100% compatibility.
- Commits remain separated by migration fix, access controls and delivery documentation. The README badge links to current GitHub CI.
- Native Cloudflare build `9d0341d3-043d-43f8-95d9-e24ce24f54b3` succeeded; its recorded source is `push_event`, branch `main`, commit `dc3c6c490902c28198701eb5c1e64457f80e6afa`. It ran full verification, checked remote migrations and deployed the Worker. The anonymous homepage still returns an Access redirect (302).
- Release GitHub CI succeeded: https://github.com/happyloa/collab-edge/actions/runs/35817429573.
- The [Chinese README](../README.zh-TW.md) and [i18n guide](i18n.md) document language persistence, server rendering and untranslated user content. The app's language selector does not customize Cloudflare-managed login pages or OTP emails.

## GitHub integration and remaining validation

The user-provided setup token resolved Access and Builds authorization. Repository connection `73c10708-51fc-4d7b-914b-2122b8713902` and production trigger `d5048a22-ca1a-4390-842a-01904be97a9a` connect `happyloa/collab-edge` to this Worker. Only `main` deploys. Pure docs, README and AGENTS changes are excluded to save build minutes. The obsolete disabled GitHub Actions deployment workflow has been removed; GitHub CI remains enabled.

The owner must complete Access email verification to validate authenticated production use, including live WebSocket collaboration. Browser automation runtime initialization failed in this session, so no authenticated screenshot or browser smoke is claimed. Local two-browser E2E remains passing. [Deployment configuration](deployment.md) records the live settings. Never disable Access to bypass the login requirement.

## Remaining product limits

Production attachments remain disabled. Member invitations add registered application accounts without sending email; the outer Access allowlist still admits only the owner. Password reset, application-account email verification, ownership transfer, account deletion and automatic event compaction are not implemented. The [branded verification email](email/README.md) includes HTML, plain text and desktop/mobile previews, but is not integrated into Access delivery.

All remote migrations are applied and immutable. Retain every migration and its metadata for fresh installations and future schema changes.

## Cost boundaries

Production has per-IP throttling, a persistent global dynamic-request budget, transactional write/storage quotas and disabled R2 operations. Workers Free is the platform billing boundary; application limits alone cannot guarantee a zero invoice on a paid/shared account. Keep Workers and any Access/Builds setup on free plans. Do not enable paid overages, preview deployments, production attachments or paid image optimization.
