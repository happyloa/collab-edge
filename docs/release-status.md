# 驗證狀態與限制

更新於 2026-11-14。歷史紀錄見 Git。

## 自動驗證

- `pnpm verify`：100 個 Workers 測試、21 個 React 測試、ESLint 相容性探針、Vinext 相容檢查與正式建置皆通過。
- `pnpm test:e2e`：69 個本機瀏覽器情境通過（完整 Chromium 套件，加上 Firefox／WebKit 的導航、鍵盤對話框與歷史維護）。
- 審計依[例外政策](dependencies.md)解讀，不宣稱零 advisory。

本機與 CI 通過不代表下方的人工驗收已完成。

## 部署

- 最後一筆有紀錄的部署：應用 commit `69a4f09`，Workers Build `31aa86a6-af71-43e2-af95-0becd8d3efb4`，version `f5a933a7-2983-49fc-b028-6592fe8063db`。
- 2026-11-12 推上 `main` 的那批（含 migration `0007_board_scoped_cards`）會自動觸發 Workers Builds，但沒有留下部署紀錄。下次請在 Cloudflare 後台確認 build 與 migration 結果後補記。
- `fix/uiux-spec-completion` 分支的修補尚未合併，也尚未部署。

正式站只允許擁有者的 Access 信箱。匿名請求會導向 Access，正式附件停用，未使用付費服務；Workers Free 方案由擁有者確認，未另外讀取帳單。

## 尚未完成的人工驗收

- 通過 Access 登入後的正式流程，依[正式站 smoke 清單](deployment.md#production-smoke-check)。
- 讀屏工具、實體手機與 Safari、完整 WCAG 與對比審核。
- 所有頁面、語系與主題的穩定視覺回歸。
- Firefox／WebKit 快速直接導頁時偶有取消載入的診斷訊息；一般連結導航測試通過，改版前也有此現象。
