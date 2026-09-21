# Dependency decisions

Vinext and its official Cloudflare adapter are currently published as beta releases; the official scaffold selects them. React Server Components uses the exact same React version as react-dom and react-server-dom-webpack.

TypeScript 6.0.3 is selected because typescript-eslint currently supports versions below 6.1. Vitest 4.1.11 matches @cloudflare/vitest-plugin's required ^4.1 range. These are intentional compatibility pins.

ESLint 10 replaces the now-deprecated ESLint 9 line. eslint-plugin-react 7.37.5 and eslint-plugin-jsx-a11y 6.10.2 still advertise ESLint 9 as their maximum peer. Both are wrapped with the official @eslint/compat rule bridge. A version-scoped .pnpmfile.cjs hook corrects the peer metadata; `node tests/lint-tooling.mjs` verifies actual React and accessibility failures are still detected. Remove the hook and bridge after upstream releases native ESLint 10 support.

Drizzle Kit 0.31.10 still depends on deprecated @esbuild-kit/esm-loader. The workspace override redirects that renamed loader to its maintained successor tsx 4.23.15. Migration generation must be tested after changing this override.

The Cloudflare test plugin currently brings an upstream Miniflare alpha dependency. It is test-only and selected by the official plugin; the application does not directly choose an alpha package. This is an upstream limitation to track.
