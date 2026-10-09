# 視覺與動態設計紀錄

## 2026-10-09：讓協作行為成為展示主題

新版首頁使用較大的標題、分欄留白與編號段落，讓訪客先理解協作場景，再看資料提交流程與產品預覽。公開展示頁共用同一個情境解說元件，讓無法進入私人 Worker 的訪客也能看到作品特色。

| 參考                                                                                                                            | 查核到的內容                                                                      | 本次採用                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| [Exat — CSS Design Awards](https://www.cssdesignawards.com/woty2025/sites/exat-typeface/)與[官方作品](https://exat.hottype.co/) | 評分頁以 kinetic typography、色彩與網格描述作品；實際首頁使用醒目的大字與大片留白 | 大型雙語標題、明確閱讀層級與編號段落，保留 CollabEdge 的 Noto Sans TC 與灰綠配色 |
| [Lusion v3 — Awwwards elements](https://www.awwwards.com/inspiration/mobile_thumbnail-submission-650970892ec97887227982)        | Awwwards 頁面列出 scroll animation、reactive cursor interaction 與手機版元素      | 分段進場與可操作的同步情境，把互動用於說明產品行為                               |

這些是本次設計判斷，不代表 CollabEdge 獲得評分或獎項。部分 Awwwards 作品詳情頁無法直接擷取，本次使用可查詢的官方 elements 摘要及 CSS Design Awards 原始作品連結；沒有把未完整載入的 Lusion 首頁當成實際驗收證據。

GSAP 控制首頁文字、情境面板進場、捲動段落與 ticker。情境按鈕切換時，卡片以短暫位移與淡入呈現新狀態。Ticker 離開視窗即暫停。使用 [gsap.matchMedia](<https://gsap.com/docs/v3/GSAP/gsap.matchMedia()/>) 限定動態於 `prefers-reduced-motion: no-preference`，切換偏好、語言或卸載時回復並清理。

Alice／Bob 情境是明列的示意圖，不發 API 請求，不儲存資料，也不模擬真實延遲或連線品質。正式看板的拖曳卡片不加入這些 GSAP transform。瀏覽器原生捲動保留，鍵盤可切換情境；螢幕閱讀器透過按鈕的 pressed 狀態與 polite live 區域取得更新。減少動態模式保留內容與操作，停用動畫。

共用元件在 `components/collaboration-story.tsx`；`app/globals.css` 明確註冊 `../components` 為 Tailwind source，使不同 Vite root 的主站與展示頁都能產生共用元件的樣式。[Tailwind source detection](https://tailwindcss.com/docs/detecting-classes-in-source-files)。

驗收涵蓋中英文、深淺色、窄視窗、情境的鍵盤切換與無伺服器請求。Firefox／WebKit、慢裝置與完整螢幕閱讀器驗收仍待後續補齊。沒有新增 WebGL、影片背景或動畫套件依賴。

## 先前版本的參考

The earlier home page used these Awwwards references:

- [Alejandro Schintu — Web design](https://www.awwwards.com/sites/alejandro-schintu-web-design): heading microanimations inspired the staged hero text and collaboration-node entrance.
- [Oaksun Studio — Silky Smooth Marquee Scroll](https://www.awwwards.com/inspiration/silky-smooth-marquee-scroll-oaksun-studio): the moving text band inspired a quieter, noninteractive loop of product ideas.
- [Noomo redesign case study](https://www.awwwards.com/new-focus-new-brand-new-website.html): its account of GSAP performance issues informed the small number of timelines and scoped cleanup.

That version used decorative collaboration nodes alongside the hero, ticker, product preview and feature reveals. The new version replaces those nodes with the explicit scenario selector and removes their unused CSS. Native scrolling and reduced-motion cleanup remain part of the design.

No animation targets the actual draggable board cards. The home page keeps English and Traditional Chinese text in the existing i18n catalog; ticker copies are decorative and hidden from assistive technology.
