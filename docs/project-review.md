# 專案審查與改善順序

審查日期：2026-10-05；後續狀態更新至 2026-10-06。範圍包含套件相容性、登入、HTTP 錯誤處理、即時協作、資料生命週期、前端維護與作品展示。下方保留原審查發現與驗收建議；第 1～3 項已完成修正，見 [API 與登入錯誤恢復](error-recovery.md)。[密鑰輪替](auth-key-rotation.md)、[本機草稿](local-drafts.md)與[備份還原](board-backups.md)已部署。CardDialog 與活動紀錄已拆分；[大型看板瀏覽器基準](snapshot-performance.md)與[卡片鍵盤驗收](keyboard-accessibility.md)已完成本機檢查。資料成長、工作區管理拆分與正式登入驗收仍待處理；各批 CI 與部署證據見 [交付狀態](delivery-status.md)。

目前值得保留的是每個看板一個 Durable Object、D1 作為資料來源、事件與實體同批提交，以及伺服器端授權與配額。既有測試覆蓋雙瀏覽器同步、衝突、權限撤銷與交易回滾，沒有足夠理由為了換模型而重寫這套架構。操作失敗時的恢復流程已改善，下一輪應處理資料成長、復原與維護成本。

## 本次完成

- 更新 16 個原本落後的直接依賴，包括 Vinext 與 Cloudflare adapter 穩定版 1.0.1、Vite、Wrangler、Drizzle 和 React Query。其他直接依賴已是查詢時的最新版。
- 保留 TypeScript 6.0.3 與 Vitest 4.1.11：最新 TypeScript 7、Vitest 5 尚不在目前 ESLint／Cloudflare 測試插件支援的 peer 範圍。pnpm 依專案規則維持 12.5.1。版本依據與解除條件見 [依賴決策](dependencies.md)。
- 更新 Wrangler 產生的 binding types，改用穩定版建議的 `vite dev`／`vite build`，保留現有 Wrangler 設定與部署保護。
- 將傳遞依賴 fflate 更新至修補版。對尚無上游修補版的 braces 深層巢狀解析問題加入版本限定 patch，並測試一般 glob 與惡意深層輸入。audit 仍有一個具名、已套用本機修補的 high advisory 例外，不能稱為零弱點。
- 分開主站與展示版的 Playwright 輸出目錄，修正同時測試時互相清除 trace 的問題。

未新增雲端產品、變更計費方案、開放 Access 或啟用正式 R2。沒有新增資料庫 migration。

## 優先處理的可靠性問題

### 1. 讓 API 錯誤保留狀態，提供可執行的恢復方式

[前端 API helper](../components/ui/providers.tsx) 對所有回應直接呼叫 `response.json()`，錯誤只保留訊息。當外層 Access 登入過期而回傳 HTML，或代理回傳非 JSON 錯誤頁時，使用者可能看到解析錯誤；UI 也無法可靠區分登入失效、權限不足、限流與服務故障。Query 預設對任何錯誤重試一次。

建議建立包含 HTTP status、錯誤代碼與 Retry-After 的 `ApiError`，先處理非 JSON／空回應，再按狀態決定重試。401 提供重新登入入口，403 說明權限，429 顯示等待或用量上限；網路與可恢復的伺服器錯誤才重試。Query 呼叫應傳入 AbortSignal，切換看板後取消不再需要的查詢。重新驗證前保留使用者草稿。

驗收：測試 JSON 401、403、429、HTML 502、空回應、取消請求與離線狀態；永久錯誤不自動重試，重新登入不丟掉草稿。

### 2. 註冊帳號與建立登入階段要一起成功

[註冊路由](../src/auth/routes.ts) 先插入 user，再呼叫 `createSession()` 寫入 session。如果第二步失敗，帳號已存在，但前端收到失敗，再次註冊會遇到已使用的信箱。這是依程式流程推導的故障情境，本次沒有在正式環境製造此故障。

建議先在交易外算好密碼雜湊與隨機 token，再用同一個 D1 batch 寫入 user 與 session；提交成功後才設定 cookie。登入建立 session 的部分可共用準備資料的 helper，但不能改掉 token 雜湊與 cookie 安全設定。

驗收：workerd 測試讓 session 寫入故意失敗，確認 user 與 session 都沒有殘留；重複 email、配額耗盡與同時註冊仍正確拒絕，正常註冊能直接進入工作區。

### 3. 所有 HTTP 回應採用一致的安全與快取標頭

[HTTP route wrapper](../src/lib/http.ts) 在成功路徑設定 `no-store` 與 `nosniff`，但 AppError、ZodError 和未知錯誤分支沒有全部套用同樣標頭。建議統一在成功／失敗回應建立後套用標頭，保留原本 status、Set-Cookie 與限流訊息。

驗收：成功、驗證失敗、未登入、配額限制與 500 回應都具備一致的標頭；cookie 與原本錯誤碼不變。

### 4. 密鑰輪替要區分密碼與 session

[密碼雜湊](../src/auth/crypto.ts) 與 [登入路由](../src/auth/routes.ts) 共用 `SESSION_SECRET` 作為密碼 pepper 和 session HMAC key。直接輪替此 secret 會同時使 session 和既有密碼失效。這需要先設計遷移，不能只換環境變數。

若要長期經營，建議加入版本化的密碼 pepper 與獨立 session key，保留舊雜湊辨識與成功登入後升級路徑。繼續遵守 workerd 的 PBKDF2 限制；正式環境的 Access 門禁與 auth 限流仍是必要條件。

驗收：輪替 session key 後，舊 session 失效但既有密碼仍可登入；舊 pepper 的升級與撤除有明確操作程序，不記錄 secret 或原始密碼。

## 接著改善資料成長與使用體驗

### 5. 先量測完整 snapshot，再決定分頁

[snapshot 查詢](../src/db/queries/snapshot.ts) 每次載入整個看板的卡片、留言與附件 metadata。卡片上限 200、每卡留言上限 50，單一看板可能包含大量目前未展開的留言。活動紀錄已有 cursor 分頁，但初始 snapshot 還是完整載入。

建議用 25／100／200 張卡片和高留言量 fixtures，記錄 snapshot bytes、D1 rows read、首頁可互動時間與拖曳回應，再評估卡片詳情按需載入。調整時必須同時處理 WebSocket snapshot、replay 與前端 reducer 的一致性。

驗收：留下相同環境、相同資料規模的前後數據；兩個獨立瀏覽器在詳情載入、重連與權限撤銷後仍看到正確資料。本次未執行 Lighthouse 或 Core Web Vitals 量測，沒有實測分數。

### 6. 草稿能跨重新整理恢復

[socket client](../src/realtime/socket-client.ts) 保留失敗與衝突 mutation 在 React state／ref。這能支援同一頁重試，但重新整理、關閉分頁後仍會遺失。

建議先提供有數量與大小上限、按 user／board 隔離的本機草稿保存，再決定是否需要完整離線寫入佇列。登出或切換帳號時清除；不要保存 cookie、密碼或 Access token。恢復時先取得目前 revision，顯示衝突並讓使用者確認，避免盲目重送舊變更。

驗收：離線編輯後重新整理仍能找回草稿；換帳號不會看到上一個人的內容；多分頁、配額耗盡和舊 revision 都不會重複提交。

### 7. 配額耗盡後有維護與復原方案

[看板配額](../src/lib/limits.ts) 和 [BoardRoom](../worker/durable-objects/BoardRoom.ts) 限制每板 5,000 次事件；封存卡片仍保留資料並占用配額。拒絕超額操作符合零新增費用要求，但長期使用需要解釋如何處理容量。JSON 匯出也不等同可驗證的備份還原。

建議先做擁有者可操作的用量狀態、匯出格式版本與本機 restore dry-run，再規劃事件保留。事件同時承擔 mutation UUID 去重與 replay，不能直接刪舊事件；壓縮前需設計去重收據、snapshot 基線及舊客戶端完整同步 fallback。正式 R2 維持關閉，附件清理方案另行驗證費用與權限。

驗收：匯出資料能在新的本機 D1 還原並核對內容與關聯；清理後重送舊 mutation 不重複寫入，過期 cursor 能安全取得完整 snapshot；所有新操作都有伺服器端上限。

## 維護與作品呈現

[Board 元件](../components/board/board.tsx) 約 1,100 行，[Dashboard](../components/workspace/dashboard.tsx) 約 680 行，混合資料操作、對話框、權限與畫面呈現。可以逐步抽出 CardDialog、活動面板、工作區成員、帳號設定與相關 action hooks。以既有 E2E 作為行為基準，避免在拆分時同時改動即時協定或另加 UI 套件。

對話框可補上明確的 accessible name，並檢查未儲存內容在 Escape／關閉時的處理。已有鍵盤拖曳與 reduced-motion 測試，下一步適合增加對話框焦點與窄螢幕錯誤恢復驗收。

履歷展示已具備公開 repo、無後端請求的公開遊樂場，以及本機雙瀏覽器錄影。最有價值的新證據是大型看板量測與擁有者登入後的正式環境 smoke。Access 302、CI 通過與錄影都不能替代正式站登入、變更和 WebSocket 驗收；公開遊樂場也不是公開多人服務。

帳號／資源管理可先用官方 `cf`。專案本身仍是 Wrangler 設定，完整遷移應另做一輪 `cf migrate --dry-run`、設定／bindings／scripts／CI 更新與部署驗證，見 [Cloudflare 遷移文件](https://developers.cloudflare.com/cf/wrangler/)。不能只替換命令名稱。

第 1～4 與第 6 項已完成。接下來量測完整 snapshot、補上用量與復原方案；活動與工作區元件仍可繼續拆分。通知、看板範本或富文字共同編輯留在可靠性與復原流程之後。
