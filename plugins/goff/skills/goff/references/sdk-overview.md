# SDK integration: choosing, modes, tracking, testing

GOFF ships no custom SDK. Apps use an OpenFeature SDK plus a GOFF provider that talks to the relay proxy. Go-only apps may skip the proxy and embed the Go module.

## Choose the integration

Pick the provider by runtime, then read the matching reference. Copy package and option names from it; provider versions there may be stale, so check the registry.

| Runtime | Use | Read |
|---|---|---|
| Go with a proxy | Go provider, `EvaluationTypeInProcess` (default) or `EvaluationTypeRemote` | sdk-go.md |
| Go, no proxy | Go module `ffclient` with a file or other retriever | sdk-go.md |
| Node.js, NestJS | `@openfeature/go-feature-flag-provider` | sdk-node.md |
| Java, Kotlin (server), .NET | Java/.NET provider | sdk-jvm-dotnet.md |
| Python, PHP, Ruby, Rust | per-language provider; Rust uses generic OFREP | sdk-python-php-ruby-rust.md |
| Browser, React, Angular | `@openfeature/go-feature-flag-web-provider` | sdk-client.md |
| Swift, Android | mobile providers | sdk-client.md |
| Any other OpenFeature SDK | generic OFREP provider against `/ofrep/v1/evaluate/flags` | below |

Server SDKs evaluate with a dynamic context per call. Client SDKs set one static context, prefetch all evaluations and refresh by websocket or polling; change context with the SDK's set-context call, which re-fetches.

## Evaluation modes

- In-process (default for Go, Java, .NET, Python, Node.js): the provider downloads flag config from `POST /v1/flag/configuration`, evaluates locally (WASM engine), polls for changes and batches events to `POST /v1/data/collector`. Lowest latency, recommended for servers. Node in-process loads WASM: in Next.js add `serverExternalPackages: ["@openfeature/go-feature-flag-provider"]`, else `WasmNotLoadedException`.
- Remote: each evaluation calls the proxy over OFREP. Fits a sidecar proxy.
- PHP, Ruby and Rust: docs show remote only; whether in-process exists is unverified, verify against docs.
- OFREP has no tracking endpoint, so `client.track()` is not forwarded through a generic OFREP provider.

## Context

- Send only attributes the flags use; they are the only inputs to targeting. When a flag declares `bucketingKey`, send that attribute too (rules are skipped without it).
- `gofeatureflag.flagList` (client bulk evaluation) limits evaluation to the listed flags; others return `FLAG_NOT_FOUND`. `gofeatureflag.currentDateTime` overrides "now"; use it in tests. Full table in flags-fields.md.
- Server-side `evaluationContextEnrichment` is merged into every context and overrides same-named fields.

## Tracking and data export

- Every evaluation emits a feature event when the flag's `trackEvents` is not `false` and the proxy has an exporter. Providers buffer and flush them; tune with the provider's flush interval, max pending events and disable-data-collection options (names per language in the references).
- `client.track("event-name", context, details)` (Go: `client.Track(ctx, name, evalCtx, of.NewTrackingEventDetails(value))`) sends a tracking event. Works only with GOFF providers (Go, Java, Python, .NET, JS/TS); the proxy needs an exporter with `eventType: "tracking"`.
- Exporter metadata (provider option `ExporterMetadata` or context key `gofeatureflag.exporterMetadata`; string, bool, int, float) lands in each event's `metadata`. Needs proxy >= v1.41.1.
- Exporters themselves are configured on the proxy (proxy-components.md); the Go module has its own `DataExporter` config.

## Test

Generic practice (both flag paths, defaults, no shared flag service) is in the `feature-flags` skill. No GOFF test double is documented for any language: use the OpenFeature SDK's in-memory provider if the installed version has one (verify against the package or `go doc`), or the repo's existing flag fake. GOFF-specific steps:

1. In Go, test with the module and a local flag file (sdk-go.md); do not hit a shared proxy.
2. Check the error code on `*Details` evaluations (`FLAG_NOT_FOUND`, `TARGETING_KEY_MISSING`, `TYPE_MISMATCH`, `PROVIDER_NOT_READY`) and assert the default for a missing flag and for a provider that is not ready.
3. Await readiness at startup (`SetProviderAndWait`, `setProviderAndWait`, `SetProviderAsync` in .NET). Evaluating before the provider is ready returns defaults.
4. Set time with `gofeatureflag.currentDateTime` for scheduled or progressive rollouts.
5. Check targeting without a proxy: `go-feature-flag-cli evaluate --config=<file> --ctx='{"targetingKey":"123"}'` (flags-authoring.md). Run the repo's test command and report results.
