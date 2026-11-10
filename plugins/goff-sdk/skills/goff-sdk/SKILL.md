---
name: goff-sdk
description: Integrates GO Feature Flag (GOFF) into application code through OpenFeature providers (server remote and in-process, client web and mobile), the Go module `ffclient` without a relay proxy, and OFREP. Covers evaluation context and targetingKey, bucketing, tracking events and data export from SDKs, provider options, and tests with defaults and provider errors. Use for "go-feature-flag provider", "@openfeature/go-feature-flag-provider", "go-feature-flag-web-provider", "gofeatureflag-python-provider", "OpenFeature.Providers.GOFeatureFlag", "ffclient", "GoFeatureFlagProvider", "targetingKey missing", "OFREP", or when code or manifests mention go-feature-flag with openfeature. Not for flag files, targeting queries and rollout YAML (goff-flags), running or configuring the relay proxy, retrievers, exporters and notifiers (goff-relay-proxy), or choosing a flag platform and generic flag hygiene (feature-flags).
---

# GO Feature Flag SDK integration

GOFF ships no custom SDK. Apps use an OpenFeature SDK plus a GOFF provider that talks to the relay proxy. Go-only apps may skip the proxy and embed the Go module. Evaluation always returns a value; on any error you get your default.

## Rules

1. Detect first: the repo's language, existing OpenFeature setup (`SetProvider` calls, a flag wrapper, constants, test helpers) and any GOFF provider already installed. Reuse that client, wrapper and context shape; do not add a second provider or SDK.
2. Pick the provider by runtime, then read the matching reference. Do not invent package or option names; copy them from the references. Provider versions in the references may be stale, so check the registry.
3. `targetingKey` is mandatory in every context. Without it the evaluation fails with `TARGETING_KEY_MISSING` and the default is returned. Use a stable unique id (user, session), not a random value per request.
4. The default value you pass is the fallback on every error and when the flag is missing or disabled. Make it the safe path.
5. Never put relay proxy API keys in client code, tests or committed files; read them from the environment or secret store the repo already uses. Pass `apiKey` when the proxy has `authorizedKeys` or flagSets (a flagSet request without a key fails).
6. Do not edit flag files or the proxy config from here (goff-flags, goff-relay-proxy), and do not change flags on a shared proxy without the user's go-ahead.

## Choose the integration

| Runtime | Use | Read |
|---|---|---|
| Go with a proxy | Go provider, `EvaluationTypeInProcess` (default) or `EvaluationTypeRemote` | [references/go.md](references/go.md) |
| Go, no proxy | Go module `ffclient` with a file or other retriever | [references/go.md](references/go.md) |
| Node.js, NestJS | `@openfeature/go-feature-flag-provider` | [references/node.md](references/node.md) |
| Java, Kotlin (server), .NET | Java/.NET provider | [references/jvm-dotnet.md](references/jvm-dotnet.md) |
| Python, PHP, Ruby, Rust | per-language provider; Rust uses generic OFREP | [references/python-php-ruby-rust.md](references/python-php-ruby-rust.md) |
| Browser, React, Angular | `@openfeature/go-feature-flag-web-provider` | [references/client.md](references/client.md) |
| Swift, Android | mobile providers | [references/client.md](references/client.md) |
| Any other OpenFeature SDK | generic OFREP provider against `/ofrep/v1/evaluate/flags` | below |

Server SDKs evaluate with a dynamic context per call. Client SDKs set one static context, prefetch all evaluations and refresh by websocket or polling; change context with the SDK's set-context call, which re-fetches.

## Evaluation modes

- In-process (default for Go, Java, .NET, Python, Node.js): the provider downloads flag config from `POST /v1/flag/configuration`, evaluates locally (WASM engine), polls for changes and batches events to `POST /v1/data/collector`. Lowest latency, recommended for servers. Node in-process loads WASM: in Next.js add `serverExternalPackages: ["@openfeature/go-feature-flag-provider"]`, else `WasmNotLoadedException`.
- Remote: each evaluation calls the proxy over OFREP. Fits a sidecar proxy.
- PHP, Ruby and Rust: docs show remote only; whether in-process exists is unverified, verify against docs.
- OFREP has no tracking endpoint, so `client.track()` is not forwarded through a generic OFREP provider.

## Context and bucketing

- Attributes in the context are the only inputs to targeting; a missing attribute means the rule does not match. Send only attributes the flags use.
- Percentage rollouts hash `targetingKey + flagName`, so assignment is deterministic across servers and restarts. A flag with `bucketingKey` hashes that context attribute instead (string value, dot path like `company.id`); if it is absent from the context, rules are skipped and the default is returned. Send that attribute whenever the flag declares one.
- Do not use a context key named `gofeatureflag` for your own data. Reserved: `gofeatureflag.currentDateTime` (RFC3339, overrides "now" for time-based rollouts; use it in tests), `gofeatureflag.flagList` (client bulk evaluation: only these flags, others return `FLAG_NOT_FOUND`), `gofeatureflag.exporterMetadata`.
- Server-side `evaluationContextEnrichment` is merged into every context and overrides same-named fields.

## Tracking and data export

- Every evaluation emits a feature event when the flag's `trackEvents` is not `false` and the proxy has an exporter. Providers buffer and flush them; tune with the provider's flush interval, max pending events and disable-data-collection options (names per language in the references).
- `client.track("event-name", context, details)` (Go: `client.Track(ctx, name, evalCtx, of.NewTrackingEventDetails(value))`) sends a tracking event. Works only with GOFF providers (Go, Java, Python, .NET, JS/TS); the proxy needs an exporter with `eventType: "tracking"`.
- Exporter metadata (provider option `ExporterMetadata` or context key `gofeatureflag.exporterMetadata`; string, bool, int, float) lands in each event's `metadata`. Needs proxy >= v1.41.1.
- Exporters themselves are configured on the proxy (goff-relay-proxy); the Go module has its own `DataExporter` config.

## Test

Generic practice (both flag paths, defaults, in-memory provider, no shared flag service) is in the `feature-flags` skill. GOFF-specific steps:

1. In Go, test with the module and a local flag file (references/go.md); do not hit a shared proxy.
2. Check the error code on `*Details` evaluations (`FLAG_NOT_FOUND`, `TARGETING_KEY_MISSING`, `TYPE_MISMATCH`, `PROVIDER_NOT_READY`).
3. Await readiness at startup (`SetProviderAndWait`, `setProviderAndWait`, `SetProviderAsync` in .NET). Evaluating before the provider is ready returns defaults.
4. Set time with `gofeatureflag.currentDateTime` for scheduled or progressive rollouts.
5. Check targeting without a proxy: `go-feature-flag-cli evaluate --config=<file> --ctx='{"targetingKey":"123"}'` (see goff-flags). Run the repo's test command and report results.
