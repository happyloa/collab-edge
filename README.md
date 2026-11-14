# CollabEdge

[English](README.en.md) · [公開體驗](https://happyloa.github.io/collab-edge/) · [正式網站（僅擁有者）](https://collab-edge.piafyoyo06.workers.dev)

跑在 Cloudflare Workers 上的多人即時看板：卡片、留言、指派、篩選、封存、備份還原，並能處理斷線與編輯衝突。支援繁中／英文、深淺色與鍵盤操作。

公開體驗是瀏覽器內的模擬，不連正式 API。正式站只開放擁有者，附件停用，登入後的流程尚未驗收。

## 核心設計

| 問題                     | 做法                                                           |
| ------------------------ | -------------------------------------------------------------- |
| 兩人同時修改，誰先誰後？ | 每個看板由一個 Durable Object 序列化操作，D1 保存正式資料      |
| 寫入了，對方卻沒收到？   | 資料、revision、事件同批提交後才廣播；重連時補事件或取完整快照 |
| 重試會不會重複建立？     | 每個操作帶 UUID，由資料庫唯一約束去重                          |
| 同一欄位被別人改了？     | 逐欄位比對 revision，保留你的草稿讓你決定重試或放棄            |

## 本機開發

需要 Node.js 24 與 pnpm 12.5.1（Node.js 25 以上沒有 Corepack，請直接安裝 pnpm 並把 `corepack pnpm` 換成 `pnpm`）。

```sh
corepack pnpm install --frozen-lockfile
node scripts/setup-local.mjs   # 建立本機 .dev.vars
corepack pnpm cf:typegen
corepack pnpm db:migrate:local
corepack pnpm dev
```

在兩個瀏覽器分別選 Alice、Bob，即可進入同一個示範看板。

## 測試

```sh
corepack pnpm verify      # 格式、lint、型別、Workers／React 測試、建置
corepack pnpm exec playwright install chromium firefox webkit
corepack pnpm test:e2e    # 隔離的本機瀏覽器測試
```

推送到 `main` 會自動部署，推送前請先跑完 `test:e2e`。

## 文件

- 設計：[架構](docs/architecture.md) · [即時協定、衝突與草稿](docs/realtime-protocol.md) · [錯誤恢復](docs/error-recovery.md) · [雙瀏覽器導覽](docs/realtime-walkthrough.md)
- 功能：[工作區](docs/workspaces.md) · [備份還原](docs/board-backups.md) · [事件保留](docs/event-retention.md) · [語言與鍵盤](docs/interface.md) · [公開體驗](docs/public-demo.md)
- 維運：[部署與回滾](docs/deployment.md) · [安全與配額](docs/security.md) · [金鑰輪替](docs/auth-key-rotation.md) · [測試](docs/testing.md) · [效能](docs/snapshot-performance.md) · [依賴](docs/dependencies.md) · [驗證狀態](docs/release-status.md)

[MIT](LICENSE)
