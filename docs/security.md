# Security and resource budgets

Production dynamic routes require a signed Cloudflare Access RS256 JWT for the configured owner email. The verifier checks issuer, application audience, expiration and required identity claims; an email header alone is never trusted. Missing configuration or verification failures deny access before D1/DO work. The intended edge policy is a hostname-based Access application; Worker-level Access currently does not support WebSocket upgrades. See [Cloudflare's Access documentation](https://developers.cloudflare.com/workers/configuration/cloudflare-access/).

After Access verification, a native rate-limit binding allows approximately 120 requests per IP per minute per Cloudflare location. A persistent Durable Object additionally enforces at most 5,000 dynamic requests per fixed 24-hour window globally, including WebSocket upgrades. Static assets do not consume this application counter; existing WebSocket messages have separate per-connection and mutation limits. Any guard failure returns 503; exhausted budgets return 429. The rate-limit binding is not a global billing counter. Hostname-based Access protects the production hostname and its assets, with one allow policy for the owner's email. Anonymous visitors are redirected to Access before reaching the application.

Passwords use Web Crypto PBKDF2-HMAC-SHA256 with 600,000 iterations, a fresh 128-bit random salt and a 256-bit result. Verification uses Workers' supported `node:crypto` `timingSafeEqual` with nodejs_compat. Passwords are 12–128 characters. Demo identities cannot sign in with passwords.

Sessions use two random UUIDs (244 random bits), expire after seven days, and are stored as HMAC-SHA256 digests keyed by SESSION_SECRET. Cookies are HttpOnly, SameSite=Lax, Path=/ and Secure on HTTPS. Logout deletes the session server-side. A user retains at most ten active sessions. Secrets are never committed or placed in Wrangler vars.

Every write validates same-origin Origin and its payload. Socket upgrades validate Origin. Every message checks the current session and membership; every board event recipient is reauthorized. OWNER manages workspace membership/settings; EDITOR mutates boards; VIEWER reads only. The workspace owner cannot be removed or demoted. Ownership transfer requires the owner's password, a current member's acceptance with their own password within seven days, and an atomic D1 update of the owner and both roles. The recipient's three-workspace quota is enforced during acceptance and by a D1 trigger. Proposals are limited to one per workspace; the owner may cancel and the recipient may decline. Demo identities cannot transfer. Password confirmation has a persistent per-account attempt limit. Auth endpoints use persistent per-IP, per-account and global limits; stored keys are hashes rather than raw identifiers.

Uploads authorize before reading the body, accept only PNG/JPEG/WebP/PDF/text, enforce bounded streaming and check signatures. Filenames are metadata; object keys are server UUIDs. Downloads always reauthorize and use Content-Disposition attachment, application/octet-stream, no-store and nosniff. R2 has no public URL. Text validation rejects NUL; this is not malware scanning.

## Automated security checks

GitHub Actions runs CodeQL's `security-extended` queries on JavaScript/TypeScript and workflow files, plus `pnpm audit --audit-level high` for dependencies. An independent local Semgrep Community Edition scan on 2026-09-25 ran the security-audit and secrets rulesets over 107 tracked files: 70 applicable rules, zero findings. The dependency audit also found no known vulnerabilities.

The initial CodeQL scan found one high-severity CWE-367 race in `scripts/setup-local.mjs`: checking whether `.dev.vars` existed before writing could overwrite a file created between those operations. The script now creates the file atomically with exclusive `wx` mode and preserves an existing file. Local create/preserve checks and CodeQL reanalysis of the fix branch passed with no open findings. Static scans do not replace an authenticated production smoke test or a penetration test.

## Resource limits

| Resource                   | Hard application limit                                  |
| -------------------------- | ------------------------------------------------------- |
| Registered users           | 100 globally                                            |
| Workspaces                 | 3 per owner                                             |
| Members                    | 10 per workspace                                        |
| Boards                     | 5 per workspace; 100 globally                           |
| Columns / cards            | 12 / 200 per board; archived cards count                |
| Comments                   | 50 per card; 2,000 characters each                      |
| Description                | 10,000 characters                                       |
| Socket connections         | 20 per board                                            |
| Socket message size / rate | 32 KiB / 60 per minute per connection                   |
| Accepted board mutations   | 2,000 per UTC day globally                              |
| Event retention            | 5,000 per board; 20,000 globally; 50 MiB payload budget |
| Attachments                | 10 per card; 10 MiB per file                            |
| Lifetime upload budget     | 100 MiB globally, including failed reservations         |
| Upload/download operations | 1,000 per rolling 24 hours globally                     |
| Demo sessions              | 100 per rolling 24 hours globally                       |

SQL triggers enforce global budgets inside the mutation transaction. Budget exhaustion aborts changes. There is no automatic paid upgrade or quota reset. Deployment defaults to ATTACHMENTS_ENABLED=false. Local development may enable local R2 independently.

Application budgets reduce abuse but do not guarantee zero provider charges on a paid plan: rejected requests also consume compute. R2 free allowances are shared across the Cloudflare account, including unrelated buckets. Do not enable production R2 or deploy onto an unverified billing plan under a strict zero-cost requirement. Billing alerts are not a hard stop.

On the private site, registration requires the signed Cloudflare Access JWT email to match the app account email. Existing password accounts may sign in and explicitly adopt that verified email; demo identities cannot adopt it. Password reset requires the same signed owner Access identity, uses the persistent auth limiter, and updates the password and deletes all app sessions in one D1 transaction. An active Access session is sufficient; no fresh app-specific email code is sent. Local environments without Access fail closed for reset. Neither flow adds a paid email sender or R2 operation. Account deletion requires password confirmation and no owned workspaces. One D1 transaction anonymizes the email, name and password, revokes sessions, removes memberships and cancels pending ownership transfers. A non-login author tombstone remains so shared comments and attachment metadata remain valid; user-authored content and its historical UUID references are not purged. D1 triggers reject new sessions, memberships and updates for deleted accounts. Tombstones still count toward the lifetime user cap, bounding retained records. MVP limitations still include malware scanning, automated orphan cleanup and a long-lived offline write queue. The [public GitHub Pages demo](public-demo.md) keeps fixture data in browser memory, sends no API requests and never opens production access. The app's seeded Alice/Bob board is shared among admitted users in local development and should not hold sensitive information. This is a bounded portfolio environment, not a compliance-certified service.
