# Card keyboard behavior / 卡片鍵盤操作

The card dialog uses native `showModal()` to keep the background inert. Opening a card from its keyboard-focused button moves focus to the close control. Tab and Shift+Tab wrap between the enabled, visible controls at the dialog boundaries; ordinary navigation within date, select and file inputs remains native. Control/Alt/Meta shortcuts are left to the browser. This follows the [WAI modal dialog keyboard pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/).

Escape requests closure. Unsaved fields or an unposted comment require a deliberate choice to keep a local draft, discard it, or continue editing. A pending save prevents closure. Closing returns focus to the original card button; if archiving removes that button, focus returns to the board heading.

卡片對話框使用原生 modal，背景保持不可操作。從卡片按鈕按 Enter 開啟後，焦點會移到關閉按鈕。Tab 與 Shift+Tab 會在可使用的控制項之間循環；日期、選單與檔案欄位保留瀏覽器原生操作，瀏覽器組合快捷鍵也不攔截。

按 Esc 關閉時，未存欄位或未送出的留言會要求選擇保留草稿、放棄或繼續編輯。儲存尚未結束時不能關閉。關閉後焦點回到原卡片；若卡片已封存，焦點改回看板標題。

## Verification / 驗證範圍

`e2e/board-accessibility.spec.ts` runs against disposable local workerd state at 1280×720 with animations and at 390×844 with reduced motion. It checks initial focus, both tab boundaries, repeated tab navigation, document/dialog width, unsaved Escape confirmation, preserved values, discard/reopen behavior, focus restoration, archiving fallback and real activity display. Existing draft scenarios separately cover persisted offline drafts. `tests/activity-panel.test.tsx` checks on-demand history loading, live/history deduplication, descending order, next-page error recovery and cached reopening.

The first browser run reproduced focus leaving the document on the fifteenth Tab at both widths. A boundary-only key handler corrected that behavior. The same desktop and narrow/reduced-motion scenarios now run in Chromium, Firefox and WebKit. They do not establish physical-device Safari behavior, screen-reader compatibility or a complete WCAG audit. Those checks and owner-authenticated production behavior remain pending.

本機測試涵蓋桌面與手機寬度、一般動態與減少動態、焦點循環、未存提示、重新開啟及活動紀錄。首次測試在兩個寬度都重現第十五次 Tab 離開文件的問題，已加入邊界處理。相同情境已納入 Chromium、Firefox 與 WebKit；實機 Safari、讀屏工具、完整 WCAG 與正式站登入後驗收仍待確認。
