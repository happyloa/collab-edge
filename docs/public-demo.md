# Public interactive demo

[Open the demo](https://happyloa.github.io/collab-edge/). This static Vite/React build is separate from the private Workers application. GitHub Pages serves it from `/collab-edge/`; no Cloudflare resource or Access bypass is added.

The demo supports editing, moving, assigning, dating, filtering, archiving and restoring sample cards. The simulated teammate edit uses the same pure mutation/conflict and event reducer functions as the application. It deliberately holds an older draft revision so a conflicting save preserves the user's input and offers an explicit retry. It is a single-tab simulation, not a WebSocket session or proof of live multi-user behavior.

For actual two-browser WebSocket behavior, follow the [realtime collaboration walkthrough](realtime-walkthrough.md), which links the local workerd scenario, test results and production verification boundary.

Shared CSS gives the demo the same brief entrances, card hover feedback and dialog animation as the app. All motion honors `prefers-reduced-motion: reduce` and uses transforms/opacity without moving drag targets.

Data lives in React state and resets on reload or Reset demo. No accounts, API requests, analytics, uploads or production data are involved. Existing application card limits bound fixture mutations and the visible activity list retains only eight entries. Language preference uses the same non-sensitive cookie as the app. Fonts are self-hosted with the published site.

```sh
pnpm build:showcase
pnpm test:showcase
pnpm exec vite preview --config showcase/vite.config.ts --port 4173
```

Open `http://localhost:4173/collab-edge/`. The Playwright scenario checks conflict recovery, archive/restore, reset, bilingual persistence, fonts, mobile overflow and absence of API/WebSocket calls. The test also captures `docs/screenshots/public-demo.png`.

`.github/workflows/showcase.yml` builds and tests this static artifact, then publishes through the GitHub Pages deployment API. Pushes that only change documentation, tests or Worker configuration do not rebuild the demo; relevant app, shared source, assets and dependency changes still do. It has no Cloudflare credentials and does not deploy the Worker. Native Workers Builds remains the only Worker deployment path. Repository Settings → Pages uses GitHub Actions (`build_type: workflow`). The public repository uses the standard GitHub-hosted runner and Pages service, without a paid plan or custom domain.

References: [GitHub Pages custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages), [Pages API](https://docs.github.com/en/rest/pages/pages#create-a-github-pages-site).
