# Authentication key rotation

New password hashes and session digests use independent secrets. The old `SESSION_SECRET` stays unchanged while legacy password hashes still exist. Its value cannot be retrieved from Cloudflare; do not replace it to perform an ordinary session rotation.

| Setting                 | Purpose                                                                                                     |
| ----------------------- | ----------------------------------------------------------------------------------------------------------- |
| `SESSION_SIGNING_KEY`   | HMAC key for new `ce2.` session tokens. Replacing it invalidates those sessions without changing passwords. |
| `PASSWORD_PEPPERS`      | Secret JSON object with one to four named password peppers. Values stay outside D1.                         |
| `PASSWORD_PEPPER_ID`    | Public identifier of the current pepper, initially `p1`.                                                    |
| `SESSION_SECRET`        | Frozen legacy password pepper, legacy session key and stable hashed auth-limit identifiers.                 |
| `LEGACY_SESSIONS_UNTIL` | Fixed legacy-cookie cutoff, initially `2026-10-13T00:00:00Z`. Do not extend it during routine releases.     |

The new hash format is `pbkdf2-sha256-peppered-v2$100000$pepper-id$salt$digest`. Verification selects only the recorded pepper, never a trial loop over all secrets. A successful login upgrades legacy or previous-pepper hashes to the current pepper. The account hash check, upgrade and session insert share one D1 transaction. If a password reset or deletion races with verification, that transaction fails and returns no cookie. Wrong passwords and failed transactions leave the existing hash untouched.

PBKDF2 remains at the workerd-supported 100,000 iterations, below [OWASP's recommended PBKDF2 work factor](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html). The independent pepper, owner-only Access policy and authentication limits remain required. This change does not claim compliance with that work-factor recommendation.

## Initial rollout

1. Run `node scripts/generate-auth-keys.mjs`. It writes a new, ignored `.tools/auth-keys.initial.json` using cryptographic randomness and exclusive file creation. It never overwrites an existing file or prints a secret. The file uses the [Cloudflare bulk-secret request format](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/secrets/methods/bulk_update/).
2. With the existing authorized account selected, discover `cf workers secrets bulk` using `cf cli search`, inspect its help/schema and upload the protected file to the existing Worker. The payload contains only the two new secrets. Omitted secrets remain unchanged. This operation creates a Worker version; inspect deployment state afterward. Never put secret values in command arguments or publish the CLI response.
3. Deploy the verified code through the existing GitHub-connected build. Wrangler remains the project's development/build/deployment tool. Confirm the new secret binding names, required vars, owner-only Access, attachment disablement and deployment budget gate.

The token must have `Account → Workers Scripts → Edit` for the account that owns the Worker. A 403 from the secret API means the upload is not confirmed; read back the binding names and keep the code deployment pending. Do not replace `SESSION_SECRET` to work around an upload error. The initial production rollout used the bulk API after the token permission was corrected. 4. Observe an authenticated login and password upgrade with an account the owner controls. Do not change the owner's password or rotate the live signing key merely to demonstrate a test. Workerd regressions exercise invalidation and rollback locally.

New local environments get all three secrets from `node scripts/setup-local.mjs`. Existing `.dev.vars` files are preserved by that script; add independent local values for the two new bindings before development. Never copy production keys into a local environment.

## Session rotation

Replace only `SESSION_SIGNING_KEY` with a new cryptographically random value, using a protected secret file. Existing `ce2.` cookies stop authenticating because their stored digests no longer match. Users sign in again with their existing passwords. At the fixed grace deadline, old unprefixed cookies stop authenticating too. HTTP requests, password confirmations, logout and WebSocket recipients use the same token-to-digest rule.

Before the legacy cutoff, a session-key rotation alone does not revoke legacy cookies. For immediate revocation, set `LEGACY_SESSIONS_UNTIL` to a past timestamp in the same release. Keep the old password pepper intact. Revoking sessions does not delete board data or change passwords.

## Pepper rotation and retirement

Add a new named pepper to `PASSWORD_PEPPERS`, keep the current/previous versions, and set `PASSWORD_PEPPER_ID` to the new identifier. Successful logins upgrade their hash transactionally. The keyring is bounded to four entries; missing or malformed configuration fails closed with a generic 503.

Do not remove a pepper until an authorized database inventory confirms no active password hash still references it. Inactive accounts require an Access-verified password reset before their pepper can be retired. A compromised pepper requires a reset for affected users, following [OWASP's pepper guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#peppering); gradual login upgrades alone are not an incident response.

Do not change `SESSION_SECRET` while any legacy password hash remains. Even after those hashes are gone, it also keys stable auth-limit identifiers; replacing it resets those buckets. No automated secret rotation, forced production password reset or legacy-secret deletion happens in this release.
