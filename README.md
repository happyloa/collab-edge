# CollabEdge

[English](README.en.md) · [公開體驗](https://happyloa.github.io/collab-edge/) · [正式網站](https://collab-edge.piafyoyo06.workers.dev)

多人即時協作看板，支援卡片、留言、篩選、封存、備份還原，以及斷線與編輯衝突恢復。提供繁體中文／英文、明暗主題與鍵盤操作。

公開體驗是瀏覽器內的模擬，不連正式 API。正式網站受擁有者 Cloudflare Access 保護，附件已停用；登入後的正式流程尚未完成驗收。

## 本機開發

需要 Node.js 24、pnpm 12.5.1。

```sh
corepack pnpm install --frozen-lockfile
node scripts/setup-local.mjs
corepack pnpm cf:typegen
corepack pnpm db:migrate:local
corepack pnpm dev
```

設定腳本只建立本機 `.dev.vars`。不要提交密鑰或測試資料。可在不同瀏覽器分別以 Alice、Bob 進入同一個示範看板。

## 驗證

```sh
corepack pnpm verify
corepack pnpm exec playwright install chromium firefox webkit
corepack pnpm test:e2e
corepack pnpm build:showcase
corepack pnpm test:showcase
corepack pnpm test:perf
corepack pnpm audit
```

瀏覽器測試使用隔離的本機資源。安全審計保留一個已修補的 `braces@3.0.3` 例外，詳見[依賴決策](docs/dependencies.md)。

## 架構與維護

Vinext／React 處理頁面與 HTTP；每個看板由一個 Durable Object 序列化操作，D1 保存資料。操作、revision 與事件同批提交，以 UUID 去重；衝突保留草稿供使用者處理。

專案仍使用 Wrangler。Cloudflare 帳號與資源管理優先使用 `cf`；完整遷移需另外驗證設定、bindings、建置與部署。

- [架構](docs/architecture.md) · [即時協定](docs/realtime-protocol.md) · [雙瀏覽器測試導覽](docs/realtime-walkthrough.md)
- [測試](docs/testing.md) · [部署](docs/deployment.md) · [安全](docs/security.md)
- [驗證狀態與限制](docs/release-status.md) · [開發規則](AGENTS.md)

[MIT](LICENSE)
