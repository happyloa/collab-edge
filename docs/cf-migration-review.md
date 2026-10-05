# Cloudflare CLI migration review

On 2026-10-05, a clean checkout was assessed with `cf@1.0.0-beta.12` using `cf migrate --dry-run --no-install`. No configuration, dependency, lockfile, binding, resource, route or CI file was changed. The command returned exit code 1 because manual follow-up is required; this is not a successful migration.

The dry run selected Vite because this project declares `@cloudflare/vite-plugin`. It proposed a `cloudflare.config.ts` file and identified these items:

- Configure the existing static assets directory through the Vite project.
- Preserve D1's `migrations_dir` and migration bookkeeping.
- Review both Durable Object bindings and their exported classes: `BoardRoom` and `AuthRateLimiter`.
- Add the project dependency during an actual migration. Installation was deliberately disabled for this read-only assessment.

The installed `@vinext/cloudflare@1.0.1` adapter still documents Wrangler configuration inputs and uses the generated `dist/server/wrangler.json`. Before adopting `cf` for project commands, test that the adapter and Vite integration produce the same HTTP/RSC, asset and WebSocket routing, exported classes and deployment artifact. Then update scripts and CI together, preserve the existing IDs and zero-cost gate, regenerate binding types, run verification and inspect the deployed version. Do not treat a generated config or a command rename as completion.

For now, account and resource management uses `cf`; project development, build, local/remote SQL migrations, type generation and deployment retain the verified Wrangler/Vinext workflow. This follows the [official guidance for existing Wrangler projects](https://developers.cloudflare.com/cf/wrangler/). A complete migration is a separate change after the manual items above are resolved. Do not run `cf dev`, `cf build` or `cf deploy` against this unmigrated project.
