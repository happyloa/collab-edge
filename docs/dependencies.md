# Dependency decisions

jose 6.2.12 is pinned for Cloudflare Access JWT signature and claim verification, following Cloudflare's documented jose integration.

GSAP 3.15.0 supplies the landing page's scoped entrance, ticker and ScrollTrigger sequences, plus transitions in the collaboration illustration shared with the public demo. Each component cleans up its animation context, honors `prefers-reduced-motion`, and leaves draggable board elements to the drag-and-drop library. The ticker pauses outside the viewport.

Vinext and its official Cloudflare adapter use the stable 1.0.1 releases. Development and build scripts use the recommended `vite dev` and `vite build` commands. The adapter still supports the project's Wrangler configuration and deployment command. React Server Components uses the exact same React version as react-dom and react-server-dom-webpack.

Checked against the npm registry on 2026-10-05, all direct dependencies use the latest release except two compatibility pins. TypeScript remains at 6.0.3 because typescript-eslint 8.71.0 supports versions below 6.1; TypeScript 7.0.2 is outside that range. Vitest remains at 4.1.11 because @cloudflare/vitest-plugin 1.3.6 requires ^4.1; it does not support Vitest 5.0.3. Recheck these peer requirements before updating either major version.

ESLint 10 replaces the now-deprecated ESLint 9 line. eslint-plugin-react 7.37.5 and eslint-plugin-jsx-a11y 6.10.2 still advertise ESLint 9 as their maximum peer. Both are wrapped with the official @eslint/compat rule bridge. A version-scoped .pnpmfile.cjs hook corrects the peer metadata; `node tests/lint-tooling.mjs` verifies actual React and accessibility failures are still detected. Remove the hook and bridge after upstream releases native ESLint 10 support.

Drizzle Kit 0.31.11 still depends on deprecated @esbuild-kit/esm-loader. The workspace override redirects that renamed loader to its maintained successor tsx 4.23.15. Migration generation must be tested after changing this override.

The Cloudflare test plugin currently brings an upstream Miniflare alpha dependency. It is test-only and selected by the official plugin; the application does not directly choose an alpha package. This is an upstream limitation to track.

The fflate 0.7.x dependency from Vinext's image-generation tooling is overridden to 0.7.5, the compatible fix for [GHSA-px8p-9vwx-vf98](https://github.com/advisories/GHSA-px8p-9vwx-vf98).

On 2026-10-09, release auditing identified [GHSA-wq5f-xc86-pv6w](https://github.com/advisories/GHSA-wq5f-xc86-pv6w) in sharp's bundled librsvg dependency. A version-scoped override replaces vulnerable sharp 0.35.x resolutions with the upstream 0.35.5 patch across image-generation and optional peer paths. This stays within the installed parents' compatible 0.35.x range. Remove it after ordinary dependency resolution consistently selects a tested fixed version. No new audit exception was added. Security probes reject vulnerable locked versions and render a small SVG through the installed native binding to verify the image pipeline still works.

On 2026-10-06, CI reported [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) for source-map-js 1.2.1. Its indexed-map offsets can amplify a small input into excessive synchronous work. All PostCSS, Tailwind and css-tree paths now resolve to the upstream [1.2.2 fix](https://github.com/7rulnik/source-map-js/releases/tag/v1.2.2) through the lockfile, without a new override or audit exception. Security probes check every locked version, malformed and oversized offsets, nested offset amplification and normal source-node conversion.

Vinext's build tooling also pulls in braces 3.0.3. [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) has no published upstream fix as of 2026-10-05. A version-scoped pnpm patch limits delimiter nesting and recursive compiler, expansion and stringify walks to bounded depth, including direct AST inputs. `tests/dependency-security.mjs` checks normal glob behavior, 2,000-level malicious inputs and the pinned lockfile version. CI runs it before the high-severity audit. Only this advisory is excepted in `audit.ignore`; pnpm reports it as one reviewed, ignored high advisory, not a clean scan. Remove the patch and exception when upstream publishes a tested fix. Do not use a blanket `--ignore-unfixable` setting.

The project still uses `wrangler.jsonc`. A full migration to `cf` should update configuration, bindings, scripts, deployment budget checks and CI together, starting with `cf migrate --dry-run`. Account/resource commands can use `cf` before that migration. See [Cloudflare's migration guidance](https://developers.cloudflare.com/cf/wrangler/).
