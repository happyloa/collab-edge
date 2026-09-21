# Security and resource budgets

Passwords use Web Crypto PBKDF2-HMAC-SHA256 with 600,000 iterations, a fresh 128-bit random salt and a 256-bit result. Verification uses Workers' supported `node:crypto` `timingSafeEqual` with nodejs_compat. Passwords are 12–128 characters. Demo identities cannot sign in with passwords.

Sessions use two random UUIDs (244 random bits), expire after seven days, and are stored as HMAC-SHA256 digests keyed by SESSION_SECRET. Cookies are HttpOnly, SameSite=Lax, Path=/ and Secure on HTTPS. Logout deletes the session server-side. A user retains at most ten active sessions. Secrets are never committed or placed in Wrangler vars.

Every write validates same-origin Origin and its payload. Socket upgrades validate Origin. Every message checks the current session and membership; every board event recipient is reauthorized. OWNER manages workspace membership/settings; EDITOR mutates boards; VIEWER reads only. The workspace owner cannot be removed or demoted. Auth endpoints use persistent per-IP, per-account and global limits; stored keys are hashes rather than raw identifiers.

Uploads authorize before reading the body, accept only PNG/JPEG/WebP/PDF/text, enforce bounded streaming and check signatures. Filenames are metadata; object keys are server UUIDs. Downloads always reauthorize and use Content-Disposition attachment, application/octet-stream, no-store and nosniff. R2 has no public URL. Text validation rejects NUL; this is not malware scanning.

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

MVP limitations: no email ownership verification, password reset, malware scanning, account deletion, automated orphan cleanup or long-lived offline write queue. Do not put sensitive information in the shared public demo. It is a bounded portfolio environment, not a compliance-certified service.
