# Testing

`pnpm verify` checks formatting, ESLint, strict TypeScript, Workers tests, React DOM tests, lint compatibility probes, Vinext compatibility and production build. `pnpm test:e2e` separately runs Chromium against two independent browser contexts. CI runs both gates without production credentials.

Workers tests use @cloudflare/vitest-plugin and actual local D1/R2/SQLite Durable Objects. They cover PBKDF2, session digest binding, validation, field-level conflicts, stale creates, server ordering, reducer gaps, idempotency, atomic rollback, viewer rejection, event replay, snapshot fallback, limiter persistence, hibernation and R2 write authorization.

React Testing Library checks viewer attachment controls, rejecting large uploads before fetch, and accessible theme controls. `node tests/lint-tooling.mjs` proves the compatibility bridge still reports real React key and accessibility errors.

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
