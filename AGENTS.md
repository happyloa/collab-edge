# Working on CollabEdge

- Vinext App Router owns pages and ordinary HTTP APIs. worker/index.ts only routes WebSockets and exports DO classes.
- One BoardRoom per board serializes mutations, snapshots and attachment writes. D1 is canonical; DO storage holds only coordination/rate metadata. Use hibernating sockets.
- Entity writes, revision and event must commit in one D1 batch. Broadcast only after commit. Never bypass mutation UUID uniqueness, revision guards or field conflict checks.
- Authorize every HTTP/WS operation and event recipient. Validate external payloads. Preserve attempted edits on failure. Never trust client ordering numbers.
- User requires zero additional Cloudflare costs. Do not upgrade plans or enable production R2 until billing allowances are verified. Keep deployment gated. Enforce quotas server-side and fail closed.
- pnpm 12.5.1 only. Use `corepack pnpm` if no pnpm shim exists on Windows. The lockfile is authoritative.
- Commands: `pnpm dev`, `pnpm cf:typegen`, `pnpm db:migrate:local`, `pnpm verify`, `pnpm test:e2e`, `pnpm outdated`, `pnpm audit`.
- Strict TypeScript, ESLint flat config, Prettier, Tailwind 4 Vite integration. No blanket type/lint suppressions.
- Read docs/dependencies.md before replacing compatibility pins, loader override or ESLint bridge.
- Test in workerd using @cloudflare/vitest-plugin; use independent Playwright contexts for realtime concurrency. CI does not require production secrets.
- Keep .dev.vars and environment secrets out of Git. Generate binding types with Wrangler. Do not hand-write a duplicate Env.
- SQL migrations are committed and applied by Wrangler. Never rewrite remote-applied migrations or use production schema push.
- User explicitly requires logical, separate commits. Run lint, typecheck and test:run before each major commit; verify before push/deploy.
- Report actual deployment and CI evidence. Do not claim a skipped deployment, unrun smoke check or unverified billing plan is complete.
