# CollabEdge

[繁體中文](README.md) · [Public playground](https://happyloa.github.io/collab-edge/) · [Private application](https://collab-edge.piafyoyo06.workers.dev)

A collaborative board with cards, comments, filters, archives, backup restoration, and recovery from disconnections and conflicting edits. Includes English and Traditional Chinese, light and dark themes, and keyboard controls.

The public playground is a browser-only simulation with no production API connection. The private application requires owner-only Cloudflare Access; attachments are disabled. Authenticated production acceptance remains incomplete.

## Local development

Requires Node.js 24 and pnpm 12.5.1.

```sh
corepack pnpm install --frozen-lockfile
node scripts/setup-local.mjs
corepack pnpm cf:typegen
corepack pnpm db:migrate:local
corepack pnpm dev
```

Setup creates local `.dev.vars` only. Keep secrets and test data out of Git. Use Alice and Bob in separate browsers to try the same demo board.

## Validation

```sh
corepack pnpm verify
corepack pnpm exec playwright install chromium firefox webkit
corepack pnpm test:e2e
corepack pnpm build:showcase
corepack pnpm test:showcase
corepack pnpm test:perf
corepack pnpm audit
```

Browser tests use isolated local resources. The audit retains one reviewed, patched `braces@3.0.3` exception; see [dependency decisions](docs/dependencies.md).

## Architecture and operations

Vinext and React handle pages and HTTP. One Durable Object serializes each board's operations; D1 is canonical. Entity writes, revisions and events commit together, UUIDs prevent duplicate operations, and conflicts preserve attempted edits.

This remains a Wrangler project. Prefer `cf` for Cloudflare account and resource management; a full migration requires separate configuration, binding, build and deployment validation.

- [Architecture](docs/architecture.en.md) · [Realtime protocol](docs/realtime-protocol.md) · [Two-browser walkthrough](docs/realtime-walkthrough.md)
- [Testing](docs/testing.md) · [Deployment](docs/deployment.md) · [Security](docs/security.md)
- [Verification status and limitations](docs/release-status.md) · [Development rules](AGENTS.md)

[MIT](LICENSE)
