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

The baseline log is stored locally at `.tools/uiux-v2-baseline-perf.log`. Chromium first-viewport screenshots for home, login, local demo board, workspace and static showcase are in `.tools/uiux-v2/baseline/`, at 390×844 and 1440×900, in both locales and themes. They use reduced motion and local demo data; `.tools` is ignored by Git. The workspace and board captures wait for their headings. Captures do not cover all failure states, physical devices or production Access.

## Direction and boundaries

The public experience uses an editorial composition and a visible event-line motif to explain an illustrative change, conflict and reconnect. The workspace and board use the same palette with quieter surfaces and persistent, readable state. Four initial layout studies are in [uiux-v2-wireframes.html](uiux-v2-wireframes.html). The public playground remains a browser-only simulation; local recorded collaboration and the Access-protected application must be labelled separately.

The proposed palette moves from cool gray and slate to warm paper and deep green ink. Semantic foreground, surface, border, primary, on-primary, focus and status colors must remain readable in light and dark themes. Existing Tailwind names remain available. The bundled Noto Sans TC remains the font; no remote fonts or new animation library are needed.

The product work keeps current query keys, mutation and socket behavior, native dialog lifecycle, draft recovery, permissions and keyboard dragging. Changes must not add Cloudflare services, migrations, secrets, Access policy changes or deployment configuration. Visual changes to sortable items must not compete with dnd-kit transforms.

Implementation proceeds in focused commits: tokens and shared patterns, landing, authentication, workspace, board and recovery, showcase, then verification and documentation. The release requires the existing full tests, a comparable performance run, responsive and accessibility review, and explicit reporting of checks that were not possible. No production deployment is implied by local results.
