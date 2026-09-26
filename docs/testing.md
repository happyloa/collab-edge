# Testing

`pnpm verify` checks formatting, ESLint, strict TypeScript, Workers tests, React DOM tests, lint compatibility probes, Vinext compatibility and production build. `pnpm test:e2e` separately runs Chromium against two independent browser contexts. CI runs both gates without production credentials.

Each local `pnpm test:e2e` run creates a fresh, ignored Cloudflare state directory and selects an unused local port. The runner applies the committed D1 migrations to that directory, starts Vinext against the same state, and removes only that directory after the browser suite exits. It does not touch the normal `.wrangler/state` development database. An explicitly set `E2E_BASE_URL` instead targets the named environment and skips local migration and cleanup.

Workers tests use @cloudflare/vitest-plugin and actual local D1/R2/SQLite Durable Objects. They cover PBKDF2, session digest binding, validation, field-level conflicts, stale creates, server ordering, reducer gaps, idempotency, atomic rollback, viewer rejection, event replay, snapshot fallback, limiter persistence, hibernation and R2 write authorization.

Activity tests verify newest-first revision cursors, bounded pages, authorization and invalid cursor rejection. The activity panel fetches only when opened and can load older pages without affecting WebSocket replay.

React Testing Library checks viewer attachment controls, rejecting large uploads before fetch, and accessible theme controls. `node tests/lint-tooling.mjs` proves the compatibility bridge still reports real React key and accessibility errors.

The current app suite contains 47 Workers/core tests, 3 React tests and 13 Chromium scenarios. Authentication tests verify the signed Access identity, verified-email registration, legacy-account adoption, blocked demo-account adoption, password reset with old-session revocation, ownership transfer and password-confirmed account deletion. Deletion tests cover retained shared content and races with a concurrent password reset or session revocation. Workspace tests simulate ownership transfer or membership removal between an HTTP permission check and its D1 transaction, and confirm that stale renames, invitations, role changes, removals, exits and board creation fail without partial writes. Transfer tests also revoke the password or session after confirmation to verify the D1 transaction rejects stale proof. A full-board mutation test confirms that editing one card writes only that card, keeping D1 rows written bounded. A realtime test checks that revoked members stop receiving events and presence. The browser recovery scenario checks navigation, matching passwords and bilingual errors. Theme scenarios cover initial light/dark preferences, one-click switching, explicit theme overrides, and system-driven icons before JavaScript hydration. Language scenarios cover cookie persistence, server-rendered Chinese, fallback, retained drafts and sockets. Motion scenarios check animated feedback, reduced-motion opt-out and draggable-card position stability. The other scenarios cover collaboration and demo/mobile behavior. CI runs all 13; these are local emulation tests, not authenticated production smoke tests. The separate public-demo workflow runs an additional browser-only scenario with `pnpm build:showcase && pnpm test:showcase`.

Board lifecycle tests verify rename patches retain their name revision, concurrent stale names and stale archival/restoration are rejected, archive/restore delivery is idempotent, and ordinary mutations cannot change an archived board. Metadata tests check calendar dates, independent field conflict revisions, filters, nonmember assignment rejection and metadata retention after restoration. The two-browser scenario additionally verifies synchronized assignment/due date, search, card archive/restore, read-only board archival, archived-board discovery and restoration.

The primary Playwright scenario registers Alice and Bob, creates a workspace and board, invites Bob, creates and moves a card, renames it, submits concurrent conflicting edits, retries a preserved draft, disconnects/reconnects Bob, posts a comment, uploads an attachment, checks anonymous download rejection, downloads a board JSON export and verifies its snapshot and absence of private object keys, then captures the board screenshot. Page errors fail the scenario.

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm verify
pnpm test:e2e
```

The test creates real users and boards in its disposable local state. Playwright gives each scenario a distinct test-only IP so one local loopback bucket does not exhaust the production-sized per-IP limit for the rest of the suite. Repeated `pnpm test:e2e` runs start with fresh quota counters and leave existing development data untouched. Never run cleanup against remote D1.

Set E2E_BASE_URL only for an explicitly authorized test environment. The complete scenario uploads files and therefore must not be used against production while attachments are disabled for cost control. Production smoke checks must respect its configured feature gates.
