# API 與登入錯誤恢復

註冊會在同一個 D1 batch 寫入帳號與 session。任一步驟失敗時，兩者都回滾，回應不會設定登入 cookie；使用者可以修正問題後重新註冊。相同信箱的競爭寫入由資料庫唯一限制保護，失敗方收到 409。密碼雜湊與 token 準備在 batch 前完成，成功提交後才發出 cookie。這依賴 [D1 的 batch 交易行為](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch)。

一般 HTTP API 透過 `route()` 統一處理回應，成功、錯誤與 redirect 都加上 `Cache-Control: no-store` 和 `X-Content-Type-Options: nosniff`，並保留 status、Location、Set-Cookie 與其他原有標頭。前置用量 guard 也設定相同的安全標頭。錯誤仍保留原有 `error` 訊息，另提供穩定的 `code`。

```json
{
  "error": "Please sign in",
  "code": "UNAUTHENTICATED"
}
```

| 情境                                            | 狀態／代碼                      | 使用者與前端處理                             |
| ----------------------------------------------- | ------------------------------- | -------------------------------------------- |
| 應用程式登入失效                                | 401／UNAUTHENTICATED            | 在新分頁登入，再回原頁重試                   |
| 外層 Access redirect 或 API 收到成功狀態的 HTML | ACCESS_REQUIRED                 | 不由 fetch 跟隨 redirect，提供新分頁登入入口 |
| 登入或敏感操作密碼不正確                        | 401／INVALID_CREDENTIALS        | 修正密碼；不顯示登入失效提示                 |
| 權限不足                                        | 403／FORBIDDEN                  | 顯示伺服器訊息，不自動重試                   |
| 請求限流                                        | 429／RATE_LIMITED               | 顯示 Retry-After 等待時間，不自動重試        |
| 資料／每日用量耗盡                              | 429／USAGE_LIMIT                | 保留內容，依上限等待或聯絡擁有者             |
| 離線／網路失敗                                  | 0／NETWORK_ERROR                | 顯示連線提示，查詢最多自動重試一次           |
| 暫時性服務故障                                  | 408、500、502、503、504         | 無 Retry-After 時，查詢最多自動重試一次      |
| 不符合 API 契約的成功回應                       | INVALID_RESPONSE                | 顯示回應異常，不自動重試                     |
| 呼叫者取消請求                                  | AbortError 或 signal 的取消原因 | 保留原取消原因，交由 Query 處理              |

`ApiError` 保留 status、code、Retry-After 秒數與可重試時間。JSON 失敗訊息會保留；非 JSON 錯誤頁的 HTML 與解析器內部錯誤不會顯示給使用者。204、205 和 HEAD 的成功空回應可以正常處理。伺服器若提供 Retry-After，即使是 503，也不提前自動重試；有手動重試按鈕的提示會等待到期才啟用。

所有 workspace、session、board 與 activity Query 都傳遞 AbortSignal，離開或取消查詢時終止不再需要的 fetch。重試限制只適用查詢，註冊、刪除、上傳等寫入不會自動重送。TanStack 的 [取消查詢](https://tanstack.com/query/latest/docs/framework/react/guides/query-cancellation) 與 [重試設定](https://tanstack.com/query/latest/docs/framework/react/guides/query-retries) 說明相關行為。

## 保留正在編輯的內容

錯誤提示不會自動導航。登入入口使用新分頁，原本的表單、卡片編輯器與失敗 mutation 保持在目前頁面。背景 board Query 失敗時保留已有看板，避免因錯誤畫面取代編輯器而丟失草稿。

重新登入後，可以從卡片編輯器或連線錯誤提示手動重新連線看板。重連保留目前 snapshot 與 pending edits，依原有 UUID 去重與 revision 協定同步；在收到 ready 訊息後，先核對原使用者 ID，再同步或重送 pending mutation。若換了帳號，連線會停止並要求登入原帳號，不會自動提交上一個帳號的草稿。ready 中的最新角色也會更新編輯權限。顯式重新取得看板資料時，使用者 ID 是元件 key 的一部分，避免跨帳號沿用編輯器。

這些保護限於仍開著的頁面。重新整理或關閉分頁仍可能遺失未送出的內容；跨重新整理的本機草稿保存與備份還原尚未實作。正式 R2 仍關閉，附件恢復情境只在本機 workerd／R2 測試環境執行。

## 驗證

- workerd／D1 測試讓 session insert 故意失敗，確認帳號回滾，重試可以成功；另驗證競爭註冊、100 帳號配額，以及所有回應分支的標頭。
- API client 測試涵蓋 Access redirect、HTML 錯誤頁、JSON 解析失敗、空回應、Retry-After、離線、取消與實際 Query 重試次數。
- UI 測試驗證英文／繁體中文提示、倒數與重試按鈕，以及密碼錯誤不會誤顯示重新登入入口。
- Chromium 驗證註冊失敗後保留輸入、同帳號在另一分頁登入後保留卡片草稿，以及換帳號重連時不提交舊草稿。

正式站的外層 Access OTP 與登入後操作仍需擁有者完成人工驗收。本機測試不代表該流程已在正式環境觀察到。
