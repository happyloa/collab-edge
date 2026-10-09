# 看板事件保留與維護

工作區擁有者可在看板的「活動紀錄 → 管理歷史紀錄」預覽舊事件，確認後清除一批內容。這項功能縮減事件保存的 payload；卡片、留言、指派、日期與目前看板資料不受影響。共用示範看板不能清理。

## 保留規則

| 範圍         | 行為                                                  |
| ------------ | ----------------------------------------------------- |
| 事件建立時間 | 必須早於伺服器目前時間的 30 天之前                    |
| 最近修改     | 最近 200 個版本的完整事件保留，即使已超過 30 天       |
| 單次清理     | 最多 100 筆 payload；每批須重新確認                   |
| 重試紀錄     | event ID、操作 UUID、使用者、類型、版本與時間保留     |
| 配額         | 累計事件筆數、byte 預算、看板版本與每日修改配額不重設 |

沒有背景排程或自動刪除。介面只在擁有者開啟維護或按重新讀取時查詢，不輪詢；連線正常且沒有待確認編輯才可操作。清理前必須勾選確認，清除的活動內容無法透過看板 JSON 備份還原。

這是內容保留策略，不是釋放帳號容量的工具。資料庫頁面可能重用，但畫面上的 payload byte 數不代表 D1 檔案大小、讀寫額度或帳單已減少。若看板的 5,000 次累計修改用完，清理也不會開放更多修改。全站的累計事件與匯入預算仍有效。

## 提交與重試

`GET /api/boards/:boardId/retention` 只允許目前工作區擁有者，回傳看板版本、伺服器 cutoff、符合條件的總數與大小，以及下一批的版本範圍。`POST` 送出這個預覽的 `boardId`、`expectedRevision`、`before` 與 `batch`，由該看板的 BoardRoom 入列處理。

伺服器再次驗證角色、範圍、時間與筆數，在同一 D1 batch 內檢查目前擁有權和看板版本，將指定 payload 改為 `{}`、設定 `payload_pruned`，再更新看板的清理標記。檢查失敗會整批回滾。回覆若遺失，介面保留原預覽與確認；重試仍使用同一時間與版本範圍，不會接著清理下一批。看板版本若已變更，必須重新預覽和確認。

清理不產生新的看板修改事件。一般修改重送已清理的 UUID 時，伺服器確認原使用者，送給該連線目前快照與原版本 ack，不重做修改或向其他人廣播空事件。重連仍可重播最近 200 個完整事件；缺少連續歷史時使用完整快照。活動 API 跳過已清理的內容，維持原本的版本 cursor，並提示部分舊活動已清除。

## 備份演練與限制

看板 JSON 備份包含目前資料，不含舊事件內容或操作 UUID；它不能恢復活動時間線。清理前若需要保留舊活動，現有 JSON 匯出不適用，請先停止清理並規劃另外的事件匯出。

[workerd 演練](../tests/retention.test.ts)先清理一批事件，再匯出與檢查校驗碼，分批還原到新看板。每批上傳後驅逐 BoardRoom、重送相同資料，完成後重試收據並清除暫存；驗證只建立一份副本，中文描述、指派、日期與留言保留，來源看板沒有改動。這是本機看板還原驗證，並非整個 D1、帳號或 Cloudflare 設定的災難復原演練。

程式入口：[保留規則與交易](../src/boards/retention.ts)、[HTTP API](../app/api/boards/[boardId]/retention/route.ts)、[操作介面](../components/board/history-maintenance.tsx)。新增 migration 為 `0006_lean_harrier.sql`；舊有已套用 migrations 不改寫。沒有新增 binding、付費服務、cron 或正式 R2 操作。

## English

Owners can review and clear at most 100 event payloads per request. Events must be older than 30 days and outside the latest 200 revisions. Mutation UUID receipts, actor IDs, revisions, current board data and all cumulative quotas remain intact. Shared demo history is excluded.

Each request retains its reviewed cutoff and revision range. A lost-response retry targets that same batch; a changed board requires a new preview and confirmation. Pruned mutation retries return a current snapshot and the original acknowledgment without a new write or broadcast. Activity pagination skips compacted payloads, while reconnect falls back to a snapshot if a contiguous replay is unavailable.

Board backups cannot recover discarded activity. The local restore drill covers checksums, interrupted uploads, Durable Object eviction, receipt retries and staging cleanup after compaction. Database-wide recovery, automated orphan cleanup and authenticated production restore acceptance remain separate work. No scheduled or paid service was added.
