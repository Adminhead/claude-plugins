# Feature flag platforms

Facts as researched on 2026-10-18 (the research notes live in the marketplace repo and are not shipped with this plugin; items marked "unverified" were not confirmed against official docs). Package names come from npm, PyPI and the Go proxy. Verify a version and an OpenFeature provider in the platform's docs before pinning anything.

## Contents

- Table
- Keys: what may go in client code
- Per-platform notes
- Detection hints
- Not a flag platform but often used as one

## Table

| Platform | Hosting | Licence | OpenFeature provider | Evaluation |
|---|---|---|---|---|
| LaunchDarkly | SaaS | SDKs Apache-2.0 | Official (Node, Python, Go) | Server local, client gets values |
| Unleash | Self-host or SaaS | AGPL-3.0 | Official, beta | Server local; Edge/frontend API for clients |
| Flagsmith | Self-host or SaaS | BSD-3-Clause | Yes (Node package found) | Remote default; local with server key |
| GrowthBook | Self-host or SaaS | MIT core, enterprise dirs separate | Yes (Node, Python) | Local from cached rules |
| ConfigCat | SaaS, on-prem plan, Proxy | SDKs MIT | Yes (Node, web) | Local from downloaded config JSON |
| PostHog | Self-host or SaaS | MIT outside `ee/` | Official Node, web, Python | Remote default; local with secret key |
| Statsig | SaaS | SDKs ISC | None confirmed | Server local, client gets values |
| Harness FME (was Split) | SaaS | SDKs Apache-2.0 | Official, many languages | Local, streaming or polling |
| Optimizely Feature Experimentation | SaaS | SDKs Apache-2.0 | Go and Java reported (unverified); others unconfirmed | Local from datafile |
| DevCycle | SaaS | SDKs MIT | Node (in SDK); others unverified | Local bucketing (server) |
| Flipt | Self-host (Git-native v2) | See note | Yes (Node, web, Python) | Server, plus client-side evaluation SDK |
| flagd | Self-host | Apache-2.0 | The reference provider | In-process or RPC |
| AWS AppConfig | AWS | Service | Only a community Java provider found (unverified) | App polls via Agent or API |
| Azure App Configuration | Azure | Libraries MIT | JS provider reported (unverified); .NET unverified | Library-side filters |
| Firebase Remote Config | Google | Service | None found | Client fetch; server evaluates template |
| Vercel Flags / Flags SDK | Vercel | `flags` package MIT | Adapter plus server provider | Server-side only |

## Keys: what may go in client code

| Platform | Secret, server only | Safe for client code |
|---|---|---|
| LaunchDarkly | SDK key (`sdk-...`) | Mobile key (`mob-...`) in mobile SDKs, client-side ID in JS client SDKs (per LaunchDarkly docs) |
| Unleash | Backend (client) API token, admin token | Frontend token (per Unleash docs) |
| Flagsmith | Server-side environment key | Client-side environment key (docs: "The Environment Key is public") |
| PostHog | Project secret API key (local evaluation) | Public project token: unverified, check PostHog docs |
| Harness FME | Server-side SDK key (never in client SDKs) | Client-side SDK key: unverified, treat as secret until the docs say otherwise |
| Statsig | Server secret key | Client SDK key: unverified, confirm in docs |
| Firebase | Service account / Application Default Credentials | Firebase API key for Firebase services (docs say it only identifies the project; apply restrictions) |

When the platform is not listed or marked unverified, treat every key as secret until its docs say otherwise.

## Per-platform notes

**LaunchDarkly.** Node `@launchdarkly/node-server-sdk`, browser `@launchdarkly/js-client-sdk`, React `launchdarkly-react-client-sdk`; Python `launchdarkly-server-sdk`; Go `github.com/launchdarkly/go-server-sdk/v7`. OpenFeature: `@launchdarkly/openfeature-node-server`, `launchdarkly-openfeature-server`. Flags have a temporary or permanent setting and a code-references view (per LaunchDarkly's flag debt guide); archive rather than delete. Self-host: no.

**Unleash.** Node `unleash-client`, React `@unleash/proxy-client-react`, Python `UnleashClient`, Go `github.com/Unleash/unleash-go-sdk/v5`. OpenFeature: `@unleash/openfeature-node-provider` (peer deps `@openfeature/server-sdk`, `unleash-client`, per the provider page, unverified), `@openfeature/unleash-web-provider`, `openfeature-provider-unleash`. The provider does not read env vars itself; the app passes the server URL (the sample's `/api` suffix is unverified) and the token in `customHeaders.Authorization`. Self-host: yes, AGPL.

**Flagsmith.** Node `flagsmith-nodejs`, browser/React `flagsmith`, Python `flagsmith`, Go `github.com/Flagsmith/flagsmith-go-client/v4`. OpenFeature: `@openfeature/flagsmith-provider`. Local evaluation mode requires a server-side key and polls the environment document (default 60 s). Self-host: yes.

**GrowthBook.** `@growthbook/growthbook`, `@growthbook/growthbook-react`, Python `growthbook`, Go `github.com/growthbook/growthbook-golang`. OpenFeature: `@openfeature/growthbook-provider`, `@openfeature/growthbook-client-provider`, `growthbook-openfeature-provider`. Experiments need a tracking callback wired to analytics. Self-host: yes.

**ConfigCat.** `configcat-node`, `configcat-js`, `@configcat/sdk`, Python `configcat-client`, Go `github.com/configcat/go-sdk/v9`. OpenFeature: `@openfeature/config-cat-provider`, `@openfeature/config-cat-web-provider`. SDKs download and cache a config JSON and evaluate locally. Self-host: on-prem plan or Proxy.

**PostHog.** `posthog-node`, `posthog-js`, Python `posthog`, Go `github.com/posthog/posthog-go`. OpenFeature: `@posthog/openfeature-node-provider`, `@posthog/openfeature-web-provider`, `openfeature-provider-posthog`. Per-check network call by default; local evaluation needs the secret key option (named differently across SDKs and versions, older SDKs used a personal API key) and is server-only. The key must not reach frontend code. Self-host: yes.

**Statsig.** `statsig-node`, `@statsig/statsig-node-core`, `@statsig/js-client`, `@statsig/react-bindings`, Python `statsig-python-core`. OpenAI announced its acquisition in September 2025; closing and product direction were not confirmed. No OpenFeature provider found; do not assume one.

**Harness FME (formerly Split).** Rebranded after Harness acquired Split in 2024. Node `@splitsoftware/splitio`, browser `@splitsoftware/splitio-browserjs`, Python `splitio-client`, Go `github.com/splitio/go-client/v6`. OpenFeature: official providers for many languages (Node: `@splitsoftware/openfeature-js-split-provider`). Evaluations return `control` until the SDK is ready. Split Synchronizer, Proxy and Evaluator exist for special topologies. The service itself is SaaS (the Proxy and Synchronizer run in your infrastructure). Older code may still say "split"; that is an expectation, not something checked.

**Optimizely.** `@optimizely/optimizely-sdk`, `@optimizely/react-sdk`, Python `optimizely-sdk`, Go `github.com/optimizely/go-sdk/v2`. The SDK downloads a JSON datafile by SDK key; secure environments add a datafile access token (secret).

**DevCycle.** `@devcycle/nodejs-server-sdk` (ships `DevCycleProvider` for OpenFeature, per DevCycle docs), `@devcycle/js-client-sdk`, Python `devcycle-python-server-sdk`.

**Flipt.** `@flipt-io/flipt`, `@flipt-io/flipt-client-js`, Python `flipt`, `flipt-client`. OpenFeature: `@openfeature/flipt-provider`, `@openfeature/flipt-web-provider`, `openfeature-provider-flipt`. v2 stores flags in Git; the licence is Fair Core License per the docs while the repository root file shows GPL-3.0, so check before recommending for commercial use.

**flagd.** Open-source evaluation engine, no UI; flag definitions from file, HTTP, Kubernetes or gRPC sources; provider `@openfeature/flagd-provider` (Node), `openfeature-provider-flagd` (Python), `go-sdk-contrib/providers/flagd` (Go). Good default for local development and tests.

**AWS AppConfig.** Feature flag profile type with attributes and multi-variant rules. Apps use the AppConfig Agent or `appconfigdata`. Only a community OpenFeature provider was found.

**Azure App Configuration.** Libraries: .NET `Microsoft.FeatureManagement` (+ `.AspNetCore`), JS `@microsoft/feature-management`, Python `featuremanagement`, Go `featuremanagement`, Spring `spring-cloud-azure-feature-management`. Feature filters: targeting, time window, custom.

**Firebase Remote Config.** Client SDKs or Admin SDK on the server (Node v12.1.0 or later). Always set in-app defaults.

**Vercel.** Vercel Flags is a hosted product; the `flags` package (Flags SDK) works with Next.js and SvelteKit and any provider, with `@flags-sdk/openfeature` to wrap an OpenFeature client. Evaluation is server-side. OpenFeature's post warns some Node.js providers may be incompatible with the Vercel Edge Runtime, so test each one.

## Detection hints

Search dependency manifests and lockfiles for the packages above (`package.json`, `pyproject.toml`, `requirements*.txt`, `go.mod`, `pom.xml`, `*.csproj`), then imports, config files and env var names. Typical signals, mostly inferred from package names rather than documented defaults:

- OpenFeature: `@openfeature/*`, `openfeature-sdk`, `go-sdk`, calls like `getBooleanValue` or `OpenFeature.setProvider`.
- flagd: `flagd` provider packages, flag definition files (flagd docs show JSON; other formats unverified), a `flagd` container in compose or Kubernetes manifests.
- LaunchDarkly: `launchdarkly` packages, env names containing `LD` or `LAUNCHDARKLY` (guess), `variation(` calls.
- Unleash: `unleash-client`, `isEnabled(`, a URL and token passed to the client (the OpenFeature provider takes them as config).
- Split/Harness FME: `splitio` packages, `getTreatment(`, env names containing `SPLIT` (guess).
- Others: look for the package names in the notes above.
- Home-grown: a `flags` or `features` module, `FEATURE_*` env vars, a settings table. Use it; do not replace it.

## Not a flag platform but often used as one

Env vars, config files and database settings tables are acceptable for ops toggles and early release flags. They have no targeting, audit or gradual rollout; say so when the user wants those.
