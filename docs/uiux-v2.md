# UI/UX v2 design and verification

## Baseline

The redesign starts from `393274b774d049bfe53d619bc9fa971e2d3d00f8` on the `feat/uiux-v2` branch. The specification is in the owner's desktop `specs/uiux-v2` folder. Current source and project instructions take precedence over the dated audit where they differ: Vinext is now 1.3.1 and Vitest is 5.0.5.

The public landing is `components/home.tsx`, with the illustrative interaction in `components/collaboration-story.tsx`. Authentication uses `components/auth-form.tsx` and `components/password-reset-form.tsx`; workspace and board presentation live under `components/workspace/` and `components/board/`. The separate static playground is `showcase/main.tsx`. Both builds share `app/globals.css` and the English and Traditional Chinese catalog in `src/i18n/messages.ts`.

Before redesign, `corepack pnpm verify`, `corepack pnpm test:e2e` (47 tests), `corepack pnpm build:showcase` and `corepack pnpm test:showcase` (2 tests) passed locally on this commit. The first E2E attempt lacked the updated Firefox and WebKit binaries; after installation the full suite passed. WebKit logged cancelled module requests during rapid navigation; a separate local rerun passed, and request diagnostics recorded cancellation. This does not establish production browser behavior.

On the same Windows machine, `corepack pnpm test:perf` passed with isolated local Vite/workerd, synthetic data, disabled browser cache and unthrottled Chromium 156.0.8078.4. These single-run figures are noisy local observations, not field Web Vitals.

| Cards / comments |   Ready |     LCP | Open dialog | Filter | Keyboard move and acknowledgement |
| ---------------- | ------: | ------: | ----------: | -----: | --------------------------------: |
| 25 / 125         | 1416 ms | 1788 ms |      177 ms |  62 ms |                            282 ms |
| 100 / 1,000      |  504 ms |  864 ms |      172 ms |  40 ms |                            264 ms |
| 200 / 4,000      |  701 ms | 1012 ms |      250 ms |  46 ms |                            519 ms |

The baseline log is stored locally at `.tools/uiux-v2-baseline-perf.log`. Chromium first-viewport screenshots for home, login, local demo board, workspace and static showcase are in `.tools/uiux-v2/baseline/`, at 390×844 and 1440×900, in both locales and themes. The dark captures were retaken after a capture setup error and checked with `data-theme` and visual inspection. They use reduced motion and local demo data; `.tools` is ignored by Git. The workspace and board captures wait for their content. Captures do not cover all failure states, physical devices or production Access.

## Direction and boundaries

The public experience uses an editorial composition and a visible event-line motif to explain an illustrative change, conflict and reconnect. The workspace and board use the same palette with quieter surfaces and persistent, readable state. Four initial layout studies are in [uiux-v2-wireframes.html](uiux-v2-wireframes.html). The public playground remains a browser-only simulation; local recorded collaboration and the Access-protected application must be labelled separately.

The proposed palette moves from cool gray and slate to warm paper and deep green ink. Semantic foreground, surface, border, primary, on-primary, focus and status colors must remain readable in light and dark themes. Existing Tailwind names remain available. The bundled Noto Sans TC remains the font; no remote fonts or new animation library are needed.

The product work keeps current query keys, mutation and socket behavior, native dialog lifecycle, draft recovery, permissions and keyboard dragging. Changes must not add Cloudflare services, migrations, secrets, Access policy changes or deployment configuration. Visual changes to sortable items must not compete with dnd-kit transforms.

Implementation proceeds in focused commits: tokens and shared patterns, landing, authentication, workspace, board and recovery, showcase, then verification and documentation. The release requires the existing full tests, a comparable performance run, responsive and accessibility review, and explicit reporting of checks that were not possible. No production deployment is implied by local results.

## Implementation and verification

The feature branch contains shared light and dark tokens, localized skip navigation, a public-first landing page, responsive authentication, a board-first workspace, clearer board and draft states, card positioning without dragging, and a revised static playground. The playground uses local state; its tests check that it sends no API or WebSocket requests and does not preload recordings.

| Spec area                        | Implementation and local evidence                                                                                                                                                                                                                                                                  |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Home and change story            | `components/home.tsx`, `components/collaboration-story.tsx`; landing and motion E2E cases cover locale, theme, keyboard, reduced motion and the public paths.                                                                                                                                      |
| Authentication                   | Shared `AuthShell`; auth navigation, recovery and API-error E2E cases. The screenshot matrix includes validation, pending and error states.                                                                                                                                                        |
| Workspace                        | `components/workspace/dashboard.tsx`; workspace layout and management, account deletion, ownership and backup E2E cases. Captures include empty, owner and viewer views and expanded administration.                                                                                               |
| Board and card                   | `components/board/board.tsx`, `card-dialog.tsx`; board accessibility, positioning, mobile filters and two-browser collaboration E2E cases. The editor offers a non-drag move and a guarded close path.                                                                                             |
| Recovery and safety              | `e2e/drafts.spec.ts`, `e2e/api-recovery.spec.ts`, `e2e/history-maintenance.spec.ts` and `e2e/backups.spec.ts` exercise recovery, expiry, retention and restore.                                                                                                                                    |
| Public showcase                  | `showcase/main.tsx` and `showcase/tests/showcase.spec.ts`; the static-build tests observe WebSocket events as well as fetch/XHR and check that recordings are not preloaded.                                                                                                                       |
| Accessibility and responsiveness | `e2e/design-tokens.spec.ts`, `e2e/landing-v2.spec.ts`, `e2e/responsive-v2.spec.ts`, `e2e/board-accessibility.spec.ts` and `e2e/motion.spec.ts` cover selected contrast, accessible names, focus, zoom, forced colors and reduced-motion cases. Manual device and screen-reader checks remain open. |

The ownership test checks invitation, recipient and password field widths at 320 and 390 pixels in both locales, then completes a transfer between separate accounts.

On the completed product changes, `corepack pnpm verify` passed, including formatting, lint, typecheck, 88 workerd tests, 15 React tests, Vinext checks and the production build. The final `corepack pnpm test:e2e` passed all 66 configured cases across Chromium, Firefox and WebKit; Firefox and WebKit run the selected navigation, board accessibility and history cases. `corepack pnpm build:showcase` and both showcase tests passed. The existing locale and board recovery tests exercise drafts, conflict, movement and browser navigation.

Chromium checks cover all eight requested widths, both locales and themes, forced colors, and CSS-based 200% zoom on the landing, authentication, workspace and board screens. The authentication, workspace and board checks also inspect accessible names of interactive controls in the browser accessibility tree. These automated checks do not replace screen-reader or physical-device review.

E2E logs contain WebKit and Firefox module-load errors during rapid navigation. An instrumented local development run reproduced Firefox's failed Vinext module request alongside `NS_BINDING_ABORTED`; the functional navigation assertions still passed. The same local production build passed Firefox and WebKit navigation tests, but rapid WebKit navigation also reported same-origin fetch errors using “access control checks” wording. A repeat of the WebKit test that waited for network idle before each direct navigation passed without those page errors. A separate local development test that follows the actual sign-in and registration links recorded no page errors in Firefox and WebKit. These results suggest a connection with navigation timing, but do not establish the cause of every error or production Access behavior. [Playwright issue 42823](https://github.com/microsoft/playwright/issues/42823) and [issue 43120](https://github.com/microsoft/playwright/issues/43120) document similar cancellation messages in other reproductions; they do not prove this application's error has the same cause. No errors were suppressed.

The final `corepack pnpm test:perf` passed all three cases using the local test setup described above. Results below are individual measurements; they are not field Web Vitals or stable benchmarks.

| Cards / comments |   Ready |     LCP | Open dialog | Filter | Keyboard move and acknowledgement |
| ---------------- | ------: | ------: | ----------: | -----: | --------------------------------: |
| 25 / 125         | 2328 ms | 2700 ms |      147 ms |  63 ms |                            261 ms |
| 100 / 1,000      |  827 ms | 1192 ms |      332 ms |  61 ms |                            614 ms |
| 200 / 4,000      | 1166 ms | 1424 ms |      381 ms |  97 ms |                            934 ms |

The initial and final single runs above were measured at different times and varied substantially. To make a closer comparison, three baseline and three redesign runs were subsequently interleaved using the same local setup. The table reports the median of each group, rounded to milliseconds. The largest median increase was 12.2%, for the 200-card keyboard move and acknowledgement; all measured median increases were below the 20% investigation threshold. This is limited local evidence rather than a field-performance guarantee.

| Cards / comments | Ready baseline → redesign | LCP baseline → redesign | Open baseline → redesign | Filter baseline → redesign | Move and ACK baseline → redesign |
| ---------------- | ------------------------: | ----------------------: | -----------------------: | -------------------------: | -------------------------------: |
| 25 / 125         |            1417 → 1439 ms |          1788 → 1796 ms |             174 → 161 ms |                 61 → 62 ms |                     261 → 272 ms |
| 100 / 1,000      |              912 → 908 ms |          1212 → 1224 ms |             309 → 326 ms |                 74 → 71 ms |                     528 → 535 ms |
| 200 / 4,000      |            1204 → 1189 ms |          1472 → 1476 ms |             431 → 414 ms |                 91 → 96 ms |                    950 → 1066 ms |

The six detailed logs are stored locally as `.tools/uiux-v2/perf-final-{baseline,current}-{1,2,3}.log`.

After the later conflict-dialog and mobile workspace changes, `corepack pnpm test:perf` passed again. Its single run measured dialog opening at 167, 303 and 472 ms, and keyboard move plus acknowledgement at 288, 485 and 999 ms for 25, 100 and 200 cards respectively. These observations are not another three-pair comparison; the log is `.tools/uiux-v2-acceptance/.tools-perf-final-v2.log`.

Lighthouse 13.6.0 mobile simulations used local built Workers on the same Windows machine, with Access disabled only for the isolated localhost processes. The baseline returned Performance 100, Accessibility 98, Best Practices 100 and SEO 100; LCP was 0.9 s, CLS 0.004 and total blocking time 60 ms. The final redesign returned 100 in all four categories, LCP 1.1 s, CLS 0.007 and total blocking time 20 ms. These are single lab runs, not field INP or proof of production performance. Reports are retained locally under `.tools/`.

The same Lighthouse reports recorded these initial local transfer sizes. The values include network overhead reported by Lighthouse and are not production CDN measurements.

| Resource                                    |  Baseline |  Redesign |
| ------------------------------------------- | --------: | --------: |
| JavaScript                                  | 256,752 B | 258,627 B |
| CSS                                         |  42,998 B |  44,099 B |
| Fonts                                       | 221,368 B | 221,368 B |
| Media                                       |       0 B |       0 B |
| Total including document and other requests | 534,394 B | 537,964 B |

An intermediate home-page build loaded an additional 73,731-byte font subset for a decorative arrow character. Replacing that character with the existing vector icon removed the extra font request in the final run.

On 2026-10-30 the owner reviewed and accepted the homepage and board first-viewport visual direction in the local preview. Further manual accessibility and device checks remain separate from that visual approval.

Before and after screenshots are under the ignored `.tools/uiux-v2/` directory; 356 expanded state captures are in `.tools/uiux-v2/current/extended/`. They cover the home story, authentication validation/loading/error states, empty and populated workspaces, owner and viewer views, board filtering, pending writes, conflicts, offline drafts, expired access, read-only boards, card editing and unsaved guards, and the public showcase. Captures use local test accounts and controlled browser conditions; pending and expired-access captures intercept the local WebSocket. Some generated account identifiers and quota timestamps vary between captures. A contact-sheet review covered the captured states at reduced size. It revealed mobile pending and showcase-conflict screenshots at the wrong scroll position, which were recaptured. Reviewing the mobile home and workspace at full width also revealed narrow ownership-transfer fields; the fields were adjusted and the workspace captures retaken. Other long full-page screenshots remain too small in the overview for detailed visual acceptance.

Representative first-viewport comparisons are committed under [before](screenshots/uiux-v2/before/) and [after](screenshots/uiux-v2/after/): home and the local demo board at 390 and 1440 pixels, in both locales and themes. The after directory also includes card-dialog conflict captures at 390 and 1280 pixels in both locales and themes. The local fixture regenerates card identifiers, so these are visual comparisons rather than pixel-identical snapshots. The wider state matrix remains local and is not part of the Git commit.

The mutation flow closes the card editor after a write is queued. If that update conflicts, the board attention area preserves the attempted fields and offers a review action. Opening that action shows the current card and the attempted fields together in the card dialog, with the existing retry and discard actions. Manual screen-reader review, physical-device review and Access-authenticated production checks remain open. No production deployment was performed; local results do not establish its behavior.

`corepack pnpm audit` returned “No known vulnerabilities found” under the configured audit policy. The policy retains one reviewed exception for `GHSA-vfj7-8cjw-p6xm` in patched `braces@3.0.3`; the patch and security probes are documented in [dependencies.md](dependencies.md). The result is not an unqualified zero-advisory scan.

The redesign did not change migrations, deployment configuration, Cloudflare bindings or the backend protocol. This remains a Wrangler project; a separate authorized migration to `cf` would start with `cf migrate --dry-run` and must include configuration, bindings, scripts, CI and deployment validation.
