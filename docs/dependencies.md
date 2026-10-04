# Dependency decisions

jose 6.2.12 is pinned for Cloudflare Access JWT signature and claim verification, following Cloudflare's documented jose integration.

GSAP 3.15.0 supplies the landing page's scoped entrance, ticker and ScrollTrigger sequences. It runs only in the client home component, honors `prefers-reduced-motion`, and does not animate draggable board elements.

Vinext and its official Cloudflare adapter use the stable 1.0.1 releases. Development and build scripts use the recommended `vite dev` and `vite build` commands. The adapter still supports the project's Wrangler configuration and deployment command. React Server Components uses the exact same React version as react-dom and react-server-dom-webpack.

Checked against the npm registry on 2026-10-05, all direct dependencies use the latest release except two compatibility pins. TypeScript remains at 6.0.3 because typescript-eslint 8.71.0 supports versions below 6.1; TypeScript 7.0.2 is outside that range. Vitest remains at 4.1.11 because @cloudflare/vitest-plugin 1.3.6 requires ^4.1; it does not support Vitest 5.0.3. Recheck these peer requirements before updating either major version.

ESLint 10 replaces the now-deprecated ESLint 9 line. eslint-plugin-react 7.37.5 and eslint-plugin-jsx-a11y 6.10.2 still advertise ESLint 9 as their maximum peer. Both are wrapped with the official @eslint/compat rule bridge. A version-scoped .pnpmfile.cjs hook corrects the peer metadata; `node tests/lint-tooling.mjs` verifies actual React and accessibility failures are still detected. Remove the hook and bridge after upstream releases native ESLint 10 support.

Drizzle Kit 0.31.11 still depends on deprecated @esbuild-kit/esm-loader. The workspace override redirects that renamed loader to its maintained successor tsx 4.23.15. Migration generation must be tested after changing this override.

The Cloudflare test plugin currently brings an upstream Miniflare alpha dependency. It is test-only and selected by the official plugin; the application does not directly choose an alpha package. This is an upstream limitation to track.

The fflate 0.7.x dependency from Vinext's image-generation tooling is overridden to 0.7.5, the compatible fix for [GHSA-px8p-9vwx-vf98](https://github.com/advisories/GHSA-px8p-9vwx-vf98).

Vinext's build tooling also pulls in braces 3.0.3. [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) has no published upstream fix as of 2026-10-05. A version-scoped pnpm patch limits delimiter nesting and recursive compiler, expansion and stringify walks to bounded depth, including direct AST inputs. `tests/dependency-security.mjs` checks normal glob behavior, 2,000-level malicious inputs and the pinned lockfile version. CI runs it before the high-severity audit. Only this advisory is excepted in `audit.ignore`; pnpm reports it as one reviewed, ignored high advisory, not a clean scan. Remove the patch and exception when upstream publishes a tested fix. Do not use a blanket `--ignore-unfixable` setting.

The project still uses `wrangler.jsonc`. A full migration to `cf` should update configuration, bindings, scripts, deployment budget checks and CI together, starting with `cf migrate --dry-run`. Account/resource commands can use `cf` before that migration. See [Cloudflare's migration guidance](https://developers.cloudflare.com/cf/wrangler/).
