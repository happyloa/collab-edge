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

The baseline log is stored locally at `.tools/uiux-v2-baseline-perf.log`. Chromium first-viewport screenshots for home, login, local demo board, workspace and static showcase are in `.tools/uiux-v2/baseline/`, at 390×844 and 1440×900, in both locales. The files labelled dark were later found to have captured the light theme and cannot serve as dark-theme baselines. They use reduced motion and local demo data; `.tools` is ignored by Git. The workspace and board captures wait for their headings. Captures do not cover all failure states, physical devices or production Access.

## Direction and boundaries

The public experience uses an editorial composition and a visible event-line motif to explain an illustrative change, conflict and reconnect. The workspace and board use the same palette with quieter surfaces and persistent, readable state. Four initial layout studies are in [uiux-v2-wireframes.html](uiux-v2-wireframes.html). The public playground remains a browser-only simulation; local recorded collaboration and the Access-protected application must be labelled separately.

The proposed palette moves from cool gray and slate to warm paper and deep green ink. Semantic foreground, surface, border, primary, on-primary, focus and status colors must remain readable in light and dark themes. Existing Tailwind names remain available. The bundled Noto Sans TC remains the font; no remote fonts or new animation library are needed.

The product work keeps current query keys, mutation and socket behavior, native dialog lifecycle, draft recovery, permissions and keyboard dragging. Changes must not add Cloudflare services, migrations, secrets, Access policy changes or deployment configuration. Visual changes to sortable items must not compete with dnd-kit transforms.

Implementation proceeds in focused commits: tokens and shared patterns, landing, authentication, workspace, board and recovery, showcase, then verification and documentation. The release requires the existing full tests, a comparable performance run, responsive and accessibility review, and explicit reporting of checks that were not possible. No production deployment is implied by local results.

## Implementation and verification

The feature branch contains shared light and dark tokens, localized skip navigation, a public-first landing page, responsive authentication, a board-first workspace, clearer board and draft states, card positioning without dragging, and a revised static playground. The playground uses local state; its tests check that it sends no API or WebSocket requests and does not preload recordings.

On the completed product changes, `corepack pnpm verify` passed, including formatting, lint, typecheck, 88 workerd tests, 15 React tests, Vinext checks and the production build. `corepack pnpm test:e2e` passed all 53 cases across Chromium, Firefox and WebKit. `corepack pnpm build:showcase` and both showcase tests passed. The existing locale and board recovery tests exercise drafts, conflict, movement and browser navigation.

After adding coverage, the three focused landing tests passed in Chromium, including all eight requested widths, both locales and themes, forced colors, and CSS-based 200% zoom. These automated checks do not replace screen-reader or physical-device review.

The E2E logs still contain WebKit and Firefox module-load errors during rapid navigation. A previous WebKit diagnostic recorded cancelled module requests during those transitions; passing assertions do not prove that all browser console errors have been eliminated.

The final `corepack pnpm test:perf` passed all three cases using the local test setup described above. Results below are individual measurements; they are not field Web Vitals or stable benchmarks.

| Cards / comments |   Ready |     LCP | Open dialog | Filter | Keyboard move and acknowledgement |
| ---------------- | ------: | ------: | ----------: | -----: | --------------------------------: |
| 25 / 125         | 2328 ms | 2700 ms |      147 ms |  63 ms |                            261 ms |
| 100 / 1,000      |  827 ms | 1192 ms |      332 ms |  61 ms |                            614 ms |
| 200 / 4,000      | 1166 ms | 1424 ms |      381 ms |  97 ms |                            934 ms |

At 200 cards the initial baseline measured a 519 ms keyboard move and acknowledgement. A later adjacent comparison measured 953 ms with the prior board implementation and 958 ms with the redesigned implementation. Local load and timing varied, so these runs do not establish either a regression or an improvement. Repeat measurements under controlled conditions are needed before claiming the 20% performance target has been met.

Lighthouse 13.6.0 mobile simulations used local built Workers on the same Windows machine, with Access disabled only for the isolated localhost processes. The baseline returned Performance 100, Accessibility 98, Best Practices 100 and SEO 100; LCP was 0.9 s, CLS 0.004 and total blocking time 60 ms. The redesigned version returned 100 in all four categories, LCP 1.1 s, CLS 0.007 and total blocking time 0 ms. These are single lab runs, not field INP or proof of production performance. Reports are retained locally under the ignored `.tools/` worktrees.

Before and after first-viewport screenshots are under the ignored `.tools/uiux-v2/` directory. The revised captures include the home, authentication screens, populated and empty owner workspace, demo board, card editing and unsaved guard, and static showcase in both languages and themes at mobile and desktop sizes. The revised dark captures were checked after correcting the capture setup. They do not cover every requested state and viewport in the acceptance matrix. Visual design approval, manual screen-reader review, physical-device review and Access-authenticated production checks remain open. No production deployment was performed; local results do not establish its behavior.

`corepack pnpm audit` returned “No known vulnerabilities found” under the configured audit policy. The policy retains one reviewed exception for `GHSA-vfj7-8cjw-p6xm` in patched `braces@3.0.3`; the patch and security probes are documented in [dependencies.md](dependencies.md). The result is not an unqualified zero-advisory scan.

The redesign did not change migrations, deployment configuration, Cloudflare bindings or the backend protocol. This remains a Wrangler project; a separate authorized migration to `cf` would start with `cf migrate --dry-run` and must include configuration, bindings, scripts, CI and deployment validation.
