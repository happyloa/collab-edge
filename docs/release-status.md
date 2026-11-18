# 驗證狀態與限制

更新於 2026-11-18。歷史紀錄見 Git。

## 自動驗證

- `pnpm verify`：110 個 Workers 測試、26 個 React 測試、ESLint 相容性探針、Vinext 相容檢查與正式建置皆通過。
- `pnpm test:e2e`：70 個本機瀏覽器情境通過（完整 Chromium 套件，加上 Firefox／WebKit 的導航、鍵盤對話框與歷史維護）。
- 審計依[例外政策](dependencies.md)解讀，不宣稱零 advisory；目前有兩則已審閱的高風險例外（braces、picomatch）。

本機與 CI 通過不代表下方的人工驗收已完成。

## 部署

- 2026-11-14：commit `75bb8be` 由 Workers Build `ef94189b-b7fb-4174-a257-4bf6311c5603` 部署成功。部署指令先執行 `db:migrate:remote`，因此到 `0007_board_scoped_cards` 為止的 migration 皆已套用。同一 commit 的 GitHub CI、CodeQL 與公開體驗發布皆成功。
- 2026-11-17：Workers Build `77bbf479-00c6-4025-bdbb-6f3d698ac9c1` 部署成功，Worker 版本 `f3f39417-deed-4eaf-b4d9-bb8d1f943ea6`，`0008_comment_edits` 已套用，留言編輯與刪除隨這版上線。前一次建置 `0ce2016f-73bb-4b2a-870a-34b5e984d1f7` 失敗在一個 React 測試的焦點斷言，修正為 commit `3e1b001`。只改測試的推送沒有觸發建置，這次是由擁有者在後台重跑；成功的檢查掛在 `b2208aa`，它與 `3e1b001` 只差那個測試檔，部署的程式相同。`3e1b001` 的 GitHub CI 與 CodeQL 皆成功。部署後匿名請求仍導向 Access（302）。
- 2026-11-17：commit `1800336` 由 Workers Build `e28421a6-c7d5-492f-93d5-2473baf85f6f` 部署成功，Worker 版本 `8994a079-fb02-45fb-92d8-eef4c155322b`，沒有新的 migration。這版換了配色與字體，並重排看板、卡片對話框、首頁、登入與工作區頁。同一 commit 的 GitHub CI 與 CodeQL 成功，公開體驗發布失敗在一個字體載入斷言；修正為 commit `2a2f68e`，之後公開體驗發布成功。
- 2026-11-17：commit `76e709d` 由 Workers Build `6529281e-bb26-43ca-a455-01c3131589f7` 部署成功，Worker 版本 `e2b417f0-064c-4578-b2dd-9d1cea003af6`，沒有新的 migration。這版把語言切換改成兩格切換、重新設計 scrollbar、拿掉首頁導覽列的「運作方式」連結，並清掉 56 個沒有使用的翻譯字串。同一 commit 的 GitHub CI、CodeQL 與公開體驗發布皆成功。
- 2026-11-18：commit `9988422` 由 Workers Build `30768453-8110-481b-9a73-60ee8d27c796` 部署成功，Worker 版本 `75bfa024-ee25-4126-b43a-363c224923f6`，沒有新的 migration。這版讓留言顯示作者、精簡卡片對話框、改寫首頁與空狀態文案、調整手機版看板標題區與載入畫面，並依對比審核修正三處配色。前一次建置 `1e1f6097-e260-48b0-a80f-a765961a4405`（commit `e0cefbf`）停在 `pnpm audit`：picomatch 的 GHSA-fc5q-39xc-vjpf 沒有修正版，擁有者同意加入有記錄的例外，理由與移除條件見[依賴](dependencies.md)。公開體驗的示範影片已用新介面重錄。

正式站只允許擁有者的 Access 信箱。匿名請求會導向 Access，正式附件停用，未使用付費服務；Workers Free 方案由擁有者確認，未另外讀取帳單。

## 尚未完成的人工驗收

- 通過 Access 登入後的正式流程，依[正式站 smoke 清單](deployment.md#production-smoke-check)，包含留言編輯與刪除，以及 2026-11-17 改版後的介面。
- 讀屏工具、實體手機與 Safari、完整 WCAG 與對比審核。
- 所有頁面、語系與主題的穩定視覺回歸。
- Firefox／WebKit 快速直接導頁時偶有取消載入的診斷訊息；一般連結導航測試通過，改版前也有此現象。
