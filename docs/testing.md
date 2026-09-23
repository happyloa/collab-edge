# Testing

`pnpm verify` checks formatting, ESLint, strict TypeScript, Workers tests, React DOM tests, lint compatibility probes, Vinext compatibility and production build. `pnpm test:e2e` separately runs Chromium against two independent browser contexts. CI runs both gates without production credentials.

Workers tests use @cloudflare/vitest-plugin and actual local D1/R2/SQLite Durable Objects. They cover PBKDF2, session digest binding, validation, field-level conflicts, stale creates, server ordering, reducer gaps, idempotency, atomic rollback, viewer rejection, event replay, snapshot fallback, limiter persistence, hibernation and R2 write authorization.

React Testing Library checks viewer attachment controls, rejecting large uploads before fetch, and accessible theme controls. `node tests/lint-tooling.mjs` proves the compatibility bridge still reports real React key and accessibility errors.

The current suite contains 24 Workers/core tests, 3 React tests and 7 Chromium scenarios. Theme scenarios cover initial light/dark preferences, one-click switching, explicit theme overrides, and system-driven icons before JavaScript hydration. Language scenarios cover cookie persistence, server-rendered Chinese, fallback, retained drafts and sockets. The other scenarios cover collaboration and demo/mobile behavior. CI runs all seven; these are local emulation tests, not authenticated production smoke tests.

Board lifecycle tests verify rename patches retain their name revision, concurrent stale names and stale archival are rejected, archive delivery is idempotent, and subsequent mutations cannot change an archived board. The two-browser scenario additionally verifies synchronized renaming, read-only archival and removal from the workspace list.

The primary Playwright scenario registers Alice and Bob, creates a workspace and board, invites Bob, creates and moves a card, renames it, submits concurrent conflicting edits, retries a preserved draft, disconnects/reconnects Bob, posts a comment, uploads an attachment, checks anonymous download rejection and captures the board screenshot. Page errors fail the scenario.

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm db:migrate:local
pnpm verify
pnpm test:e2e
```

The test creates real local users and boards. Repeated runs count against local quotas by design. Use a separate local persistence directory or intentionally reset only the disposable local test database when capacity is exhausted. Never run cleanup against remote D1.

Set E2E_BASE_URL only for an explicitly authorized test environment. The complete scenario uploads files and therefore must not be used against production while attachments are disabled for cost control. Production smoke checks must respect its configured feature gates.
