# Setup, artifacts, and upgrades

## Pick the route

The most specific framework guide wins over the base language, because frameworks often need several init points.

| Detected | Use | Not |
|---|---|---|
| Next.js | Next.js guide | browser or Node |
| Cloudflare Workers / Pages | Cloudflare guide | Node or browser |
| React Native / Expo | React Native guide | React or browser |
| React Router **framework mode** | React Router guide | React |
| TanStack Start | TanStack Start guide | React or browser |
| Other React SPA | React guide | browser |
| Plain browser JS | JavaScript guide | |
| Node, Bun, Deno server | that runtime's own guide (Bun and Deno are not Node) | |
| Flutter (even on Android) | Flutter guide | Android |

For an unlisted framework, find its guide under `docs.sentry.io/platforms/` rather than falling back to a generic SDK. Per-runtime notes are in `platforms/`.

## Inventory before editing

- Runtime, framework, and **installed** SDK version. Check every Sentry package in the lockfile.
- Every entry point that needs init: web server, workers, CLI jobs, serverless handlers, SSR, edge, test bootstrap.
- Existing init calls, error middleware or boundaries, tracing or OTel providers, logging setup.
- Where config comes from (env, build-time vars, secret manager, deploy manifests) and which layer wins per environment.
- Build pipeline and artifact output (bundles, source maps, mappings, dSYMs).

## Install and initialize

1. Use the current install and init path from the platform guide. Wizards (`npx @sentry/wizard`) are fine when the user wants them, but check the diff they produce.
2. Init once per runtime, before the code it observes. Node needs init before instrumented imports, via `--import` / `instrument.mjs` or whatever the current guide says.
3. Load the DSN from the project's normal config source. Use a placeholder like `<SENTRY_DSN>` in examples.
4. Start with error capture. Add tracing, replay, profiling, Logs, metrics, or crons only for a stated need, and set sample rates deliberately, since defaults vary by SDK and version.
5. Add framework middleware, error boundaries, and router instrumentation where the guide places them. Preserve existing error responses and fallbacks.

## Release, environment, dist

Set `release`, `environment`, and `dist` (or debug IDs) from the build that actually ships, identically in every process of that deploy. They make events findable and tie them to artifacts. Don't hand-maintain them in source.

## Source maps and native symbols

- Generate artifacts in the same build that produces the deployed bundle or binary. Release, dist, debug IDs, and artifact paths must match byte for byte.
- Uploads use `SENTRY_AUTH_TOKEN` in CI or secret storage. It must never reach client code or logs. Confirm with the user before uploading.
- Verify with a **new** event. An upload doesn't fix old events.
- Frames still minified? Compare release, dist, and debug IDs and artifact URLs before re-uploading.

Platform-specific artifacts include JS source maps (Hermes changes this for React Native), Android ProGuard/R8 mappings and NDK symbols, Apple dSYMs, Flutter/Dart obfuscation symbols, .NET PDBs, and Unity IL2CPP symbols.

## OpenTelemetry coexistence

Use this when the app already has OTel tracing.

1. Inventory tracer providers, propagators, context managers, auto-instrumentation, and exporters.
2. Pick one owner for the tracer provider. Follow the platform's documented Sentry+OTel path (for Node, `javascript/guides/node/opentelemetry/`) or use native Sentry tracing. Never both.
3. Don't run duplicate auto-instrumentation or export the same spans twice.

Generic OTel Collector or exporter pipelines are out of scope.

## Upgrades

1. Inventory every Sentry package, build plugin, and artifact tool. Upgrade them as a compatible set, since mixed `@sentry/*` versions break.
2. Read the migration guide for the exact source→target versions (`docs.sentry.io/platforms/<p>/migration/`). Apply only the migrations it lists.
3. Grep for deprecated imports, options, integrations, and hooks.
4. After a major bump, recheck privacy defaults (`sendDefaultPii` and similar) and sampling explicitly.
5. Run the full test and build. Compare error capture, frame readability, and duplicate counts against pre-upgrade behavior.

## When nothing arrives

Work through the causes in this order.

1. **No event.** Is config present at runtime (check without printing it)? Does init run before the failure? Is the right entry point used? Could `sampleRate`, `beforeSend`, or `ignoreErrors` be dropping it? Is network or CSP blocking ingest? Did the process exit before the flush?
2. **Duplicates.** Look for double init, overlapping middleware or boundaries, manual capture plus automatic capture, retries, or dev-mode double render.
3. **Missing trace.** Look for a competing provider, `tracePropagationTargets`, CORS, or sampling.
4. **Unreadable frames.** Check artifact and build-identity mismatch.
5. **Unexpected data.** Stop test traffic, remove the field at its source, and flag server-side scrubbing rules to the user.

Use the SDK's `debug: true` only temporarily and locally, then remove it.
