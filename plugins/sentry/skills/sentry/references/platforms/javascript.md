# JavaScript platforms

Version gates are a snapshot, so recheck them in Context7 `/getsentry/sentry-docs` or on `docs.sentry.io/platforms/javascript/guides/<framework>/`. Each framework has its own package (`@sentry/nextjs`, `@sentry/react`, `@sentry/cloudflare`, `@sentry/bun`, …). Never mix a generic package in to work around a framework one.

## Setup by runtime

| Runtime | Key points |
|---|---|
| Browser | Init once before rendering. Keep `tracePropagationTargets` narrow. Account for CSP and service workers. Source maps come from the shipped build |
| React SPA | Init before `createRoot`. Use the Sentry error boundary or React 19 root error hooks per the current guide. Router instrumentation for navigation spans. Not for RR framework mode or TanStack Start |
| Node | Init must load **before** instrumented modules (`--import ./instrument.mjs` for ESM; check the guide). ESM vs CJS matters. Error handler placement is per framework: Express, Fastify, Koa, Hapi, Nest |
| Bun / Deno | Separate packages and guides. Don't assume Node preload or shutdown APIs work |
| Next.js | Three runtimes: `instrumentation-client.ts` (browser), `sentry.server.config.ts`, and `sentry.edge.config.ts`, registered via `instrumentation.ts`, plus `withSentryConfig` in `next.config`. An option set in one runtime doesn't apply to the others. The App vs Pages router changes error-boundary setup (`global-error.tsx`, `onRequestError`). Caught Server Action or API failures need a deliberate capture owner |
| Cloudflare Workers / Pages | Wrap the exported handler with the documented wrapper (`withSentry` / the Pages plugin) once. Keep request data on request scope, since isolates are reused. No Node flush patterns |
| React Router framework mode | Documented client (`entry.client`) and server (`entry.server`, `handleError`) hooks. Preserve thrown responses. Don't stack generic React and Node setup |
| TanStack Start | Separate client and server setup. Global request/function middleware and the server-entry wrapper order matter. Don't infer React Router or Next.js behavior |
| React Native / Expo | Expo has its own path (config plugin = native build change). `Sentry.wrap(App)`. JS/Hermes, Android native, and iOS native are separate layers, so avoid duplicate capture across the bridge. Hermes affects source maps. Upload JS source maps plus native symbols from the same build |

Source maps: `docs.sentry.io/platforms/javascript/sourcemaps/`. The bundler plugins (`@sentry/vite-plugin`, `@sentry/webpack-plugin`, and `withSentryConfig`'s upload) take `SENTRY_AUTH_TOKEN` from the CI environment.

## Errors

- Pass an `Error` to `captureException`, since non-Error throws lose the stack.
- React boundaries don't catch event-handler or async errors. Handle those at their source.
- Don't call `captureException` in a boundary's `onError` if the Sentry boundary or root hook already reports.
- Dev StrictMode double-renders, so check duplicates in a production build.
- Next.js: an error boundary and the server `onRequestError` hook can both see one failure, so check for duplicates.
- Short-lived Node CLIs and serverless can exit before the send. `process.exit` skips cleanup. Use the documented `Sentry.flush()`/`close()`.
- The browser can lose events on unload or offline. Don't add blocking unload handlers.

## Tracing

- Browser/React: let the router integration own page-load and navigation roots. CORS on the API must allow `sentry-trace` and `baggage`.
- Node with existing OTel: use `javascript/guides/node/opentelemetry/` and don't register a second provider.
- Troubleshooting: `javascript/tracing/troubleshooting/`.

## Logs

JS Logs need SDK 9.41.0+. They're on by default from 10.71.0+, and older versions need `enableLogs: true`. The API is `Sentry.logger.trace|debug|info|warn|error|fatal(msg, attrs)` plus `Sentry.logger.fmt` for templates. Filter with `beforeSendLog`.

| Runtime | Documented bridges |
|---|---|
| Browser, React | `consoleLoggingIntegration` (multi-arg parsing from 10.13.0+), Consola `createConsolaReporter` (10.12.0+). CDN bundles and the Loader Script support Logs |
| Node, Bun, Deno, RR framework, TanStack Start, Cloudflare | Console and Consola only. **Pino, Winston, and Bunyan aren't documented here** |
| Next.js | Console, Consola, server-side Pino `pinoIntegration` (10.18.0+), Winston `createSentryWinstonTransport` (9.13.0+). Bunyan isn't supported. Configure each runtime separately |
| React Native | `@sentry/react-native` 7.0.0+ with `enableLogs: true`. Console capture is **on by default** when Logs are enabled, and `enableAutoConsoleLogs` (8.14.0+) turns it off, so watch for direct-plus-console duplicates. Consola is supported. Attributes are string, number, or bool only |

Crash or backgrounding can lose buffered RN logs.

## Metrics

SDK 10.25.0+ with `Sentry.metrics.count|gauge|distribution(name, value, { unit, attributes })`. They're on by default, and `enableMetrics: false` disables them. `beforeSendMetric` returns null to drop. They're buffered, and the pages show a `Sentry.flush()` for short-lived processes. The Node and TanStack Start pages document metrics. For browser, Next.js, Bun, Deno, Cloudflare, RR, and RN, confirm a runtime-specific page first.

## Crons

See [crons.md](../crons.md). Crons are documented for Node, Next.js (server and edge), and Cloudflare only.
