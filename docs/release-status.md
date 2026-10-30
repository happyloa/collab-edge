# 驗證狀態與限制

更新於 2026-10-31。舊版審查、線框圖及逐批交付流水帳已移除；歷史內容可從 Git 查閱。操作契約保留在各功能文件。

## UI/UX v2

首頁、帳號頁、工作區、看板、卡片與公開體驗已套用雙主題視覺系統。首頁及看板首屏已獲使用者同意。首頁進場位移最多 24px、時間最多 700ms；減少動態時內容直接顯示。拖曳欄位不套用裝飾性 transform。

本輪修補：卡片移動提示使用同一 mutation UUID 的提交事件確認成功；逐欄位區分裝置草稿、提交、衝突及伺服器確認；附件介面依伺服器設定顯示停用。手機捲動區與動作列分離，日期欄位使用原生焦點監聽保持可見，對話框明確設定初始焦點。資料庫、WebSocket 格式、UUID／revision 規則及正式資源設定未變更。

## 自動驗證

- 本輪完整 `verify`、88 個 Workers 測試、21 個 React UI 測試、安全探針、17 個看板重點跨瀏覽器情境及 2 個 showcase 情境通過。最終完整 CI 另列於發布紀錄。
- 前一版 `b881609` 的 [CI](https://github.com/happyloa/collab-edge/actions/runs/41078413441) 成功，包含 66 個 E2E；[CodeQL](https://github.com/happyloa/collab-edge/actions/runs/41078413388) 成功。
- 本輪以相同 lockfile 比較改版前 `393274b` 與 `bd15ac5`，三組本機配對包含 25／100／200 卡、最多 4,000 則留言。ready、LCP、開卡、篩選及移動確認的最大中位數退步為 15.0%，未超過 20%；六份 log 在本機 `.tools/spec-perf-{baseline,current}-{1,2,3}.log`。
- 前一輪本機 Lighthouse 四項均為 100，LCP 1.1s、CLS 0.007、TBT 20ms；這是單次實驗室結果，不代表正式站或真實使用者 INP。
- 初始傳輸量 534,394 → 537,964 B；字體維持 221,368 B。錄影由使用者選擇載入，無自動播放。
- 審計依[現行例外政策](dependencies.md)解讀，不宣稱零 advisory。

代表截圖保留在 [before](screenshots/uiux-v2/before/) 與 [after](screenshots/uiux-v2/after/)。完整狀態圖仍是本機驗收產物，尚非全矩陣穩定視覺快照。

## 已部署版本

應用 commit `69a4f09` 已透過原生 Workers Builds 部署，build `31aa86a6-af71-43e2-af95-0becd8d3efb4` 成功，version `f5a933a7-2983-49fc-b028-6592fe8063db`。後續 `b881609` 只修改測試。本輪修補尚未部署。

[公開體驗](https://happyloa.github.io/collab-edge/) 已驗證模擬衝突、重設、雙語、窄版及無私人 API／WS 呼叫。[私人應用](https://collab-edge.piafyoyo06.workers.dev) 的匿名請求會導向 Access；正式附件保持停用，未新增付費服務。Workers Free 由使用者確認，未獨立讀取帳單方案。

## 尚未完成的驗收

- 所有頁面／狀態／語系／主題截圖的詳細審查與穩定視覺回歸；首屏同意不涵蓋全部長頁。
- 全部狀態的對比與語意審核、人工 Windows 讀屏、實體裝置橫向及螢幕鍵盤檢查。使用者目前沒有 iPhone／iPad，Apple／mobile VoiceOver 未測。
- Access 登入後的正式工作區、看板及管理操作。使用者目前無法協助登入，不能用本機測試或 Access 302 代替。
- Firefox／WebKit 快速直接導頁曾有取消載入／module-load 診斷；一般連結導航測試通過，類似現象也存在於改版前。

本機與 CI 通過不會自動關閉上述驗收項目。操作正式站請依[正式 smoke 清單](production-smoke.md)，部署與 Cloudflare 成本限制見[部署說明](deployment.md)。
