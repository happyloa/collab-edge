# Interface: languages and keyboard

## Languages

Supported locales are `en` (default) and `zh-TW`. Every main screen has a keyboard-accessible language select. The root layout reads the allowlisted `collabedge_locale` cookie, so server HTML and hydration start in the same language. Changing it updates the context, the document `lang` and a one-year SameSite=Lax cookie without a reload or WebSocket reconnect. Unsupported cookie values fall back to English.

`src/i18n/messages.ts` holds English source keys with Traditional Chinese translations; use `useI18n().t(key, values)` with full phrases and named placeholders. User-authored names, descriptions, comments and filenames are never translated. API and socket errors stay in canonical English, and `errorText()` translates recognized messages at render time; unknown errors use a safe general message in Chinese mode. Browser-native validation text, Cloudflare Access pages and Access emails are outside this app's control.

## Card dialog

The card dialog uses native `showModal()` so the background is inert. Opening a card from the keyboard moves focus to the close control. Tab and Shift+Tab wrap between enabled controls at the dialog boundaries, while date, select and file inputs keep native navigation and Control/Alt/Meta shortcuts go to the browser ([WAI modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)).

Escape requests closure. Unsaved fields or an unposted comment require choosing keep draft, discard or continue editing, and a pending save prevents closure. Focus returns to the card button, or to the board heading if the card was archived.

## Board

Each card has a move handle: Space picks it up, arrow keys move it (left and right jump between columns), Space drops it and Escape cancels. Screen readers hear the picked-up card, the destination and the confirmed result. Columns can be renamed, moved and removed from **Column options**.

## Verification and open items

`e2e/board-accessibility.spec.ts` runs at 1280×720, and at 390×844 with reduced motion, in Chromium, Firefox and WebKit. It covers initial focus, tab boundaries, unsaved Escape confirmation, focus restoration and the archive fallback. `e2e/i18n.spec.ts` covers persistence, server-rendered Chinese, fallback, retained drafts and active sockets. Physical-device Safari, screen readers and a full WCAG audit have not been checked.
