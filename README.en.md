# CollabEdge

[繁體中文](README.md) · [Public playground](https://happyloa.github.io/collab-edge/) · [Private app (owner only)](https://collab-edge.piafyoyo06.workers.dev)

A realtime collaborative board on Cloudflare Workers: cards, comments, assignees, filters, archives and backup restore, with recovery from disconnects and conflicting edits. English and Traditional Chinese, light and dark themes, keyboard controls.

The public playground is a browser-only simulation with no production API. The private app is owner-only, attachments are disabled, and the signed-in production flow has not been accepted yet.

## Core design

| Problem                                  | Approach                                                                                          |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Who orders concurrent edits?             | One Durable Object serializes each board; D1 is canonical                                         |
| A write committed but the peer missed it | Entity, revision and event commit in one batch before broadcast; reconnect replays or resnapshots |
| Does a retry create duplicates?          | Every operation carries a UUID, deduplicated by a unique constraint                               |
| Someone changed the same field           | Per-field revisions detect it; your attempted edit is kept for retry or discard                   |

## Local development

Requires Node.js 24 and pnpm 12.5.1 (Node.js 25+ has no Corepack: install pnpm directly and use `pnpm` instead of `corepack pnpm`).

```sh
corepack pnpm install --frozen-lockfile
node scripts/setup-local.mjs   # creates local .dev.vars
corepack pnpm cf:typegen
corepack pnpm db:migrate:local
corepack pnpm dev
```

Choose Alice and Bob in two browsers to join the same demo board.

## Testing

```sh
corepack pnpm verify      # format, lint, types, Workers/React tests, build
corepack pnpm exec playwright install chromium firefox webkit
corepack pnpm test:e2e    # isolated local browser suite
```

Pushing to `main` deploys automatically; run `test:e2e` first.

## Docs

- Design: [Architecture](docs/architecture.en.md) · [Realtime protocol, conflicts and drafts](docs/realtime-protocol.md) · [Error recovery (zh)](docs/error-recovery.md) · [Two-browser walkthrough](docs/realtime-walkthrough.md)
- Features: [Workspaces](docs/workspaces.md) · [Backups](docs/board-backups.md) · [Event retention](docs/event-retention.md) · [Languages and keyboard](docs/interface.md) · [Public playground](docs/public-demo.md)
- Operations: [Deployment and rollback](docs/deployment.md) · [Security and quotas](docs/security.md) · [Key rotation](docs/auth-key-rotation.md) · [Testing](docs/testing.md) · [Performance](docs/snapshot-performance.md) · [Dependencies](docs/dependencies.md) · [Release status (zh)](docs/release-status.md)

[MIT](LICENSE)
