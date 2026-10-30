# Testing

Use Node.js 24 and the pinned pnpm version. Current results and untested acceptance items belong in [release status](release-status.md).

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm exec playwright install chromium firefox webkit
corepack pnpm verify
corepack pnpm test:e2e
corepack pnpm build:showcase
corepack pnpm test:showcase
corepack pnpm test:perf
```

## Coverage

| Command         | Checks                                                                                                                     |
| --------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `verify`        | Formatting, ESLint, strict TypeScript, Workers and React tests, security probes, Vinext compatibility and production build |
| `test:e2e`      | Full Chromium suite; targeted Firefox/WebKit auth navigation, keyboard dialogs and history maintenance                     |
| `test:showcase` | Static simulation, conflict recovery, reset, bilingual UI, recorded media and no private API/WS requests                   |
| `test:perf`     | Local browser fixtures with 25/100/200 cards and 125/1,000/4,000 comments                                                  |

Workers tests use local workerd, D1, R2 and SQLite Durable Objects. They cover authorization, session/key races, atomic rollback, quotas, UUID deduplication, field conflicts, ordering, replay, hibernation and private attachment access. Retention and restore tests exercise retries, compaction boundaries, staging cleanup and unchanged source data.

React tests cover recovery controls, disabled attachments, pending and conflicting field states, receipt-bound move announcements, pagination retries and irreversible-action guards. ESLint compatibility probes verify that real React and accessibility errors remain detectable.

The two-browser scenario creates Alice and Bob, invites a teammate, checks ordered updates and presence, moves a card, resolves a stale edit, reconnects, comments, uploads a local file and verifies a private export. Browser page errors fail the scenario. See the [walkthrough](realtime-walkthrough.md), [keyboard checks](keyboard-accessibility.md), [retention limits](event-retention.md) and [performance reproduction](snapshot-performance.md).

## Local isolation

Each E2E run reserves a local port, creates a fresh ignored state directory, applies committed D1 migrations and starts Vinext against that state. It removes only its temporary directory afterward; ordinary development data stays intact. Distinct test-only IPs isolate per-IP quotas between scenarios.

Stop an existing Vinext preview before running the isolated suite: Vinext permits one dev server per checkout. Run builds and E2E sequentially so the dev server's generated files remain stable.

`E2E_BASE_URL` skips local migration and cleanup and targets the named environment. Use it only for an explicitly authorized test environment. The full suite uploads files, so it must not target production while attachments are disabled. Never run cleanup against remote D1.

`capture:demo` runs the collaboration scenario against fresh local state and replaces synchronized recordings and posters in `showcase/media/` only after success. Capture and performance modes reject `E2E_BASE_URL`.

CI runs without production credentials. Playwright engine builds, local results and recorded clips do not establish physical-device, screen-reader or Access-authenticated production acceptance. Follow the separate [production smoke checklist](production-smoke.md).
