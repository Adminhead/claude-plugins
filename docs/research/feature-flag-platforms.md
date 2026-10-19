# Feature flag platforms and practice

Research notes for the `feature-flags` skill. All sources accessed 2026-10-18. A claim marked **(observed)** was checked by querying a package registry (npm, PyPI, Go module proxy) or a GitHub API/raw file on that date; **(search)** means it came from a web-search summary and was not confirmed on a primary page; **(unconfirmed)** means no primary source was found. Registry versions are snapshots, not recommendations.

---

## 1. OpenFeature

- CNCF **incubating** project: accepted 2022-06-17, moved to Incubating 2023-11-21 (announced Dec 2023) [cncf-blog]. The openfeature.dev site footer still says incubating on 2026-10-18 [of-intro, of-mid2026]. No graduation found.
- Concepts [of-intro]: the *evaluation API* (what app code calls), *providers* (translation layer to a flag system: wrap a vendor SDK, call a REST API, or read a local file), *evaluation context* (arbitrary targeting data; static values set once, dynamic values merged per evaluation), *hooks* (before/after/error/finally around an evaluation: validate, enrich context, log, telemetry).
- Defaults and errors [of-spec-eval, of-eval-api]: every typed evaluation takes a default value. Client methods must not throw; on abnormal execution (network failure, provider error, type mismatch) they return the supplied default and set `errorCode`/`reason` in the details. `get*Details` variants return value plus reason, variant, flag metadata and error code. Provider status values: `NOT_READY`, `READY`, `STALE`, `ERROR`, `FATAL` (`RECONCILING` for static-context SDKs).
- Server SDKs: C++, Dart, .NET, Go, Java, Node.js (incl. NestJS), PHP, Python, Ruby, Rust. Client SDKs: Dart, Kotlin, iOS (Swift), Web (Angular, React) [of-intro].
- Registry snapshot **(observed)**: npm `@openfeature/server-sdk` 1.23.0, `@openfeature/web-sdk` 1.10.0, `@openfeature/react-sdk` 1.4.1, `@openfeature/flagd-provider` 0.17.0, `@openfeature/flagd-web-provider` 0.8.0, `@openfeature/ofrep-provider` 0.2.5, `@openfeature/ofrep-web-provider` 0.4.3, `@openfeature/multi-provider` 0.1.3, `@openfeature/env-var-provider` 0.3.1 (no licence field). PyPI `openfeature-sdk` 0.10.0, `openfeature-provider-flagd` 0.6.0, `openfeature-provider-ofrep` 0.3.0. Go `github.com/open-feature/go-sdk` v1.19.0, `github.com/open-feature/go-sdk-contrib/providers/flagd` v0.8.0.
- **In-memory provider for tests**: the JS server SDK ships `InMemoryProvider` inside `@openfeature/server-sdk` **(observed: string present in the 1.23.0 tarball; usage not read from docs)**. Other languages ship equivalents (names not verified here). The OpenFeature docs pages I fetched did not describe it.
- Mid-2026 update [of-mid2026]: spec v0.9.0 (first since v0.8.0 in March 2024) adds tracking, a logging hook, hook data, a multi-provider appendix, an observability appendix, isolated API instances (global singleton optional) and event-driven provider lifecycle; three breaking changes. Python `set_provider()` is now non-blocking, with `set_provider_and_wait()`. "DISABLED is a successful evaluation": flagd cores now return the default for a disabled flag instead of an error. Fractional bucketing changed in a way that can move users between variants. OFREP 0.3.0 added SSE push updates.
- **Platform-native flags built on OpenFeature (2025-2026)** [of-mid2026]: Datadog (late 2025), Vercel Flags (GA April 2026, server-side OpenFeature provider), Cloudflare Flagship (public beta May 2026), Google Cloud App Lifecycle Manager flags (public preview May 2026, uses flagd engine and the community flagd provider), Mixpanel (June 2026), Octopus Deploy (public preview July 2026).
- New providers listed there: Azure App Configuration (JavaScript), localStorage (JavaScript), Optimizely (Go; Java at 1.0.0), GCP Secret Manager and Parameter Manager (Java), PostHog official Node/web/Python providers, Unleash seven official beta providers.

### flagd

- Open-source, OpenFeature-compliant flag evaluation engine with no UI or persistence layer; flags boolean/string/number/JSON with context-sensitive targeting rules; sources are files, HTTP endpoints, Kubernetes custom resources, gRPC sync services; watches sources and applies changes immediately; modes: RPC (separate process/sidecar, gRPC) and in-process (engine inside the app); also exposes OFREP [flagd]. GitHub licence Apache-2.0, last push 2026-10-17 **(observed)**.
- The flagd file format (JSON vs YAML) was not stated on the fetched page. **(unconfirmed here)**; flagd docs elsewhere describe both, check before writing a file.

### OFREP

OpenFeature Remote Evaluation Protocol: a vendor-neutral HTTP protocol, with `@openfeature/ofrep-provider` (server) and `ofrep-web-provider`. Several platforms expose it (flagd does) [flagd, of-mid2026].

---

## 2. Platform status, 2026

| Platform | Hosting / licence | OpenFeature provider | Eval model | Notes |
|---|---|---|---|---|
| LaunchDarkly | Hosted SaaS only. SDKs Apache-2.0 (observed). | Official: npm `@launchdarkly/openfeature-node-server` 2.1.2, PyPI `launchdarkly-openfeature-server` 0.8.2, Go `go-sdk-contrib/providers/launchdarkly` v0.1.7 (observed) | Server SDKs evaluate locally from streamed rules; client SDKs get evaluated values | SDK key is secret, mobile key and client-side ID are not [ld-keys] |
| Unleash | Open source (AGPL-3.0, GitHub) plus hosted (observed). | Official beta: npm `@unleash/openfeature-node-provider`, `@openfeature/unleash-web-provider` 0.1.1; PyPI `openfeature-provider-unleash` 0.1.2 (observed) | Server SDK polls and evaluates locally; frontend API / Edge for clients | Backend tokens secret; frontend tokens safe client-side; admin tokens deprecated [unleash-tokens] |
| Flagsmith | Open source (BSD-3-Clause, GitHub) plus hosted (observed). | npm `@openfeature/flagsmith-provider` 0.1.2 (observed) | Remote by default; local evaluation with a server-side key polling the environment document (default 60 s) [flagsmith-ssr] | Server-side keys are secret |
| GrowthBook | Open source, "MIT Expat" outside enterprise directories (observed LICENSE) plus hosted. | npm `@openfeature/growthbook-provider`, `@openfeature/growthbook-client-provider` 0.1.2; PyPI `growthbook-openfeature-provider` 0.0.6 (observed) | SDKs download and cache rules and evaluate locally; remote evaluation optional for client SDKs [gb-sdk] | Experiment tracking needs a tracking callback |
| ConfigCat | Hosted SaaS; on-prem self-hosted plan and a Proxy exist; SDKs MIT (observed). | npm `@openfeature/config-cat-provider` 0.8.0, `@openfeature/config-cat-web-provider` 0.2.0 (observed) | SDKs download a config JSON and evaluate locally [configcat-sdks] | SDK key is not a secret by design (**unconfirmed**) |
| PostHog | Open source (MIT outside `ee/`, observed LICENSE) plus hosted. | Official: npm `@posthog/openfeature-node-provider` 0.1.2, `@posthog/openfeature-web-provider` 0.1.1; PyPI `openfeature-provider-posthog` 0.1.107 (observed) | Remote `/flags` by default; local evaluation for Node, Ruby, Go, Python, .NET, PHP, Java, Rust, Elixir with a secret key, polling 30 s (Go 5 min) [posthog-local] | Secret key never in frontend |
| Statsig | Hosted SaaS. SDKs ISC (observed). **OpenAI announced acquisition of Statsig in Sept 2025 (about $1.1B all-stock); founder Vijaye Raji became CTO of Applications. Closing and product changes not confirmed (search)** | **Not confirmed** (none found on npm or in the OpenFeature search) | Server SDKs fetch and evaluate locally; client SDKs fetch evaluated values | Server secret key vs client key (details not fetched) |
| Harness FME (formerly Split) | Hosted SaaS. SDKs Apache-2.0 (observed). Harness announced the Split acquisition 2024-05-29, closed 2024-06-11; Split rebranded to Harness Feature Management & Experimentation (FME) [harness-split]. Nov 2025: unified Harness UI for migrated customers. Claim that Split is no longer sold standalone is from a third-party site only. | Official providers for Android, iOS, Web, Dart, Angular, React, Java, Node.js, Python, .NET, Go [harness-of]. npm `@splitsoftware/openfeature-js-split-provider` 1.3.0 still carries the Split name (observed) | SDKs evaluate locally with streaming (SSE) or polling; Split Synchronizer (Redis-backed), Split Proxy and Split Evaluator exist [harness-sdk] | Server-side key never in client SDKs [harness-sdk] |
| Optimizely Feature Experimentation | Hosted SaaS; SDKs Apache-2.0 (npm observed). | Optimizely Go provider and Java 1.0.0 listed in the OpenFeature mid-2026 post (search); JS/Python provider **unconfirmed** | SDK downloads a JSON datafile (by SDK key, polling) and evaluates locally [optimizely-init]; secure environments add a datafile access token | |
| DevCycle | Hosted SaaS; SDKs MIT (npm observed). | Node SDK ships a `DevCycleProvider` (search); other languages unconfirmed | Server SDKs bucket locally by default (search) | DevCycle-Taplytics acquisition claim not found (**unconfirmed, no evidence either way**) |
| Flipt | Open source. GitHub `LICENSE` on main is GPL-3.0 (observed) but the docs say Flipt v2 is under the Fair Core License, converting to MIT after two years; v2 stores flags in Git [flipt-lic]. Which licence applies to which release was not resolved. | npm `@openfeature/flipt-provider` 0.1.4, `@openfeature/flipt-web-provider` 0.1.6; PyPI `openfeature-provider-flipt` 0.1.3 (observed) | Server evaluation, plus client-side evaluation SDKs (`@flipt-io/flipt-client-js`, MIT) | v2 maturity: docs once said alpha, then beta; current status not confirmed |
| flagd | Open source, Apache-2.0 (observed), no UI. | The reference provider (see section 1) | RPC or in-process | Natural default when no platform exists |
| AWS AppConfig | AWS service. Feature flag profile type stores flags with attributes and constraints; supports multi-variant flags with rules evaluated against caller-supplied context [aws-ac]. | Only a community Java provider found (search). No official AWS provider found. | App polls via AppConfig Agent or `appconfigdata` (`GetLatestConfiguration`); deployment strategies control rollout | npm `@aws-sdk/client-appconfigdata` 3.1152.0, PyPI `boto3` (observed) |
| Azure App Configuration feature management | Azure service plus MIT libraries [azure-fm]: .NET `Microsoft.FeatureManagement` (+ `.AspNetCore`), JS `@microsoft/feature-management`, Python `featuremanagement`, Go `featuremanagement`, Spring `spring-cloud-azure-feature-management`. | OpenFeature mid-2026 post lists a new Azure App Configuration provider for JavaScript (search-level); .NET provider unconfirmed | Filters (targeting, time window, custom), variants, telemetry | npm `@azure/app-configuration` 1.13.0 and `@microsoft/feature-management` 2.3.1 (observed) |
| Firebase Remote Config | Google/Firebase service. Server-side via Admin SDK (Node v12.1.0+) downloads the whole template and evaluates on your server with custom signals [fb-rc]. | No official OpenFeature provider found (**unconfirmed**) | Client SDK fetch-and-activate; server template evaluation | Docs recommend in-app defaults for backend outages; npm `firebase-admin` 14.5.0 (observed) |
| Google Cloud | App Lifecycle Manager feature flags (public preview, May 2026) built on flagd and the community flagd provider [of-mid2026]. Only source is the OpenFeature blog; Google docs not fetched. | flagd provider | flagd engine | **Preview; unconfirmed on Google's own docs** |
| Vercel Flags / Flags SDK | Vercel Flags is a hosted flag product (dashboard, targeting, segments, CLI) and the `flags` npm package (Flags SDK, MIT, v4.3.1 observed) is a framework-native library for Next.js and SvelteKit that works with any provider [vercel-flags]. `@vercel/flags-core` 1.10.0 is the server client (observed). | `@flags-sdk/openfeature` 0.1.3 adapter wraps an OpenFeature client (observed); Vercel Flags itself has a server-side OpenFeature provider [of-mid2026] | Flags evaluated server-side only; Flags Explorer overrides in dev | Vercel Flags no longer needs SDK keys on Vercel deployments (OIDC) [vercel-flags page related list] |
| Datadog Feature Flags | New (late 2025) platform flags on OpenFeature [of-mid2026]. npm `@datadog/openfeature-node-server` 2.5.0 (observed). | Yes | n/a | Not on the user's list; included because it appeared repeatedly |

Other platform-native OpenFeature offerings (Cloudflare Flagship, Mixpanel, Octopus Deploy) are listed in section 1.

### Package names per language (observed in registries 2026-10-18)

| Platform | Node/JS | Python | Go |
|---|---|---|---|
| LaunchDarkly | `@launchdarkly/node-server-sdk` 9.15.0; client `@launchdarkly/js-client-sdk` 4.13.0; React `launchdarkly-react-client-sdk` 3.9.4 | `launchdarkly-server-sdk` 9.18.2 | `github.com/launchdarkly/go-server-sdk/v7` |
| Unleash | `unleash-client` 6.12.2; React `@unleash/proxy-client-react` 6.0.1 | `UnleashClient` 6.9.1 | `github.com/Unleash/unleash-go-sdk/v5` |
| Flagsmith | `flagsmith-nodejs` 8.1.2; client `flagsmith` 10.0.0 | `flagsmith` 6.3.0 | `github.com/Flagsmith/flagsmith-go-client/v4` |
| GrowthBook | `@growthbook/growthbook` 1.8.0, `@growthbook/growthbook-react` | `growthbook` 3.2.1 | `github.com/growthbook/growthbook-golang` |
| ConfigCat | `configcat-node` 11.4.1, `configcat-js` 9.6.1, `@configcat/sdk` 1.1.0 | `configcat-client` 10.0.1 | `github.com/configcat/go-sdk/v9` |
| PostHog | `posthog-node` 5.56.2, `posthog-js` | `posthog` 7.71.0 | `github.com/posthog/posthog-go` |
| Statsig | `statsig-node` 6.5.2, `@statsig/statsig-node-core` 0.23.2, `@statsig/js-client`, `@statsig/react-bindings` | `statsig-python-core` 0.23.2, `statsig` 0.72.1 | not checked |
| Harness FME | `@splitsoftware/splitio` 11.12.1, `@splitsoftware/splitio-browserjs` 1.7.1 | `splitio-client` 10.7.0 | `github.com/splitio/go-client/v6` |
| Optimizely | `@optimizely/optimizely-sdk` 6.6.1, `@optimizely/react-sdk` 4.2.1 | `optimizely-sdk` 5.7.0 | `github.com/optimizely/go-sdk/v2` |
| DevCycle | `@devcycle/nodejs-server-sdk` 1.56.1, `@devcycle/js-client-sdk` | `devcycle-python-server-sdk` 3.14.0 | not checked |
| Flipt | `@flipt-io/flipt` 1.5.0, `@flipt-io/flipt-client-js` 0.6.0 | `flipt` 2.0.0, `flipt-client` 1.4.4 | not checked |
| Vercel | `flags` 4.3.1, `@vercel/flags-core`, `@flags-sdk/openfeature` | n/a | n/a |

Java/.NET package names (for example `io.split.client:java-client`, `LaunchDarkly.ServerSdk`) were not verified in this pass and are left out of the skill unless known.

### Environment variable and config hints

Env var names are conventional and set by each user; none was confirmed as an SDK-read default except where stated. Seen in sources: Unleash sample app uses `UNLEASH_URL` and `UNLEASH_API_TOKEN` passed into config by hand, the provider itself does not read env vars [unleash-of-node]; Firebase Admin reads `GOOGLE_APPLICATION_CREDENTIALS` [fb-rc]; the LaunchDarkly dev-server uses a project key and `http://localhost:8765` [ld-keys]. Detection by package name and config file (for example flagd JSON files, `.launchdarkly`, `flags.ts`) is inferred, not documented.

---

## 3. Practice

### Flag categories (Fowler) [fowler]

- **Release** toggles hide unfinished code so it can merge to trunk; days to weeks; usually static per release.
- **Experiment** toggles run A/B tests; routing per request; stable until significance.
- **Ops** toggles control runtime behaviour (load shedding, kill switches); fast to flip without a release; some are long-lived circuit breakers.
- **Permissioning** toggles gate premium/alpha/beta access; can last years; decision per user.
- Dimension to record: longevity (temporary vs permanent) and dynamism. LaunchDarkly uses the same temporary/permanent split and lists entitlements, load shedding, branding and accessibility as permanent [ld-debt].

### Code structure [fowler, trunk-flags]

- Keep decision points separate from decision logic: one place that answers "is X on", injected into components, so most code does not know flags exist. For long-lived or multi-point toggles prefer a strategy/abstraction chosen at startup over scattered `if/else`; trunk-based development says the same.
- Convention: **off means legacy behaviour, on means new behaviour**.

### Testing [fowler, trunk-flags]

- Validate the artifact with the new flag off (legacy) and on. Not every combination: most flags do not interact; test the expected production configuration, the all-new-flags-off fallback, and optionally all-on. Unit tests must cover code that is switched off in production. CI should cover meaningful combinations (may mean multiple builds per commit).
- Runtime override endpoints help tests but should be limited to tests and debugging.
- OpenFeature in-memory provider (section 1) lets tests set flag values without a network; hooks can assert on evaluations.

### Defaults and fail-safe [of-spec-eval, ld-debt]

- Default = the safe, legacy behaviour (off for a new feature; on for a kill switch guarding something that must keep working). The SDK returns the default on any error or before initialisation (Harness SDKs return `control` until ready [harness-sdk]), so a wrong default ships to users during any outage.
- LaunchDarkly: old flags can return undesired values if turned off or if an SDK falls back to a default; test fallback values of permanent flags periodically [ld-debt].

### Client vs server evaluation and keys

- Secret: LaunchDarkly SDK key (`sdk-`), Unleash backend tokens, Flagsmith server-side keys, PostHog secret key for local evaluation, Harness server-side keys, Firebase service credentials. Non-secret by design: LaunchDarkly mobile key and client-side ID, Unleash frontend tokens [ld-keys, unleash-tokens, posthog-local, flagsmith-ssr, harness-sdk].
- Local-evaluation server SDKs download all rules to the server (hence the secret key); client SDKs receive only evaluated values for one context. PostHog states a local-evaluation key "must not be used in the frontend or exposed to users" [posthog-local].
- Flags are evaluated server-side only in the Vercel Flags SDK [of-vercel-adapter].

### Flag debt and removal [fowler, ld-debt, trunk-flags]

- Create a removal task with the flag; set an expiry/"review for delete" date; Fowler suggests "time bomb" tests that fail past expiry and a cap on the number of flags. Trunk-based development suggests removing flags and dead code about a month after release.
- LaunchDarkly: remove code references, then archive (not delete: deletion loses history and lets the key be reused); time-to-archive about 90-120 days; keep scope small; avoid flags for secrets, static config or large JSON payloads; include removal in the definition of done.
- Removal procedure (derived): pick the winning branch, delete the losing branch and the flag evaluation, delete the flag's tests for the dead path, delete the flag definition (file entry, constant, SDK registration), grep for the key across code, config, IaC and docs, then ask the owner to archive in the platform after deploy.

### Trunk-based development link [trunk-flags]

- Unfinished work ships "turned off" into trunk; flags can be launch-time (config/CLI), runtime-switchable (must persist and be shared across nodes), or build flags. Flags are easy to forget and become debt.

---

## 4. Unconfirmed or weak

- OpenFeature graduation status: none found; only incubating.
- Statsig: OpenAI acquisition deal closing and any product change; any OpenFeature provider; key names.
- Optimizely JS/Python and DevCycle non-Node OpenFeature providers; Azure .NET provider; official AWS AppConfig and Firebase providers (none found).
- Flipt licence per release (GPL-3.0 on main vs Fair Core License for v2).
- Google Cloud feature flags: only the OpenFeature blog source.
- flagd file format wording; ConfigCat key secrecy; env var defaults per SDK.
- Java/.NET package names; Statsig/DevCycle/Flipt Go packages.
- The `InMemoryProvider` API details (only presence in the package confirmed).

---

## 5. Review follow-up verification (accessed 2026-10-18)

Verified against official docs:

- LaunchDarkly mobile key (`mob-`) and client-side ID are not secret; SDK key (`sdk-`) is: https://launchdarkly.com/docs/home/account/environment/keys
- Flagsmith client-side key is public ("The Environment Key is public"; docs call it Environment Key, not ID): https://docs.flagsmith.com/clients/
- Firebase API keys for Firebase services only identify the project and are safe in client code if restricted; protection comes from Security Rules and App Check: https://firebase.google.com/docs/projects/api-keys
- DevCycle Node SDK ships `DevCycleProvider` (OpenFeature): https://docs.devcycle.com/sdk/server-side-sdks/node/node-openfeature
- Vercel Edge Runtime caveat for some Node.js OpenFeature providers: https://openfeature.dev/blog/vercel-flags-sdk-adapter
- Unleash provider package and `url`/`customHeaders.Authorization` config: https://docs.getunleash.io/sdks/openfeature/node
- PostHog local-evaluation secret key naming varies by SDK version: https://posthog.com/docs/feature-flags/local-evaluation
- LaunchDarkly code references: https://launchdarkly.com/docs/guides/flags/technical-debt

Not confirmed (hedged as "unverified" in the skill references):

- PostHog public project token as safe for client code: https://posthog.com/docs/api did not say.
- Harness FME client-side key as safe for client code: only "server-side keys should never go in client-side SDKs" was stated (https://developer.harness.io/docs/feature-management-experimentation/sdks-and-infrastructure/).
- Statsig client key safety (not fetched successfully).
- flagd YAML support: https://flagd.dev/reference/flag-definitions/ shows only JSON.
- `InMemoryProvider` in OpenFeature JS docs: the server SDK README (https://raw.githubusercontent.com/open-feature/js-sdk/main/packages/server/README.md) shows `TypedInMemoryProvider` only as a domains example and does not document testing use; `InMemoryProvider` exists in the 1.23.0 package.
- Env var name patterns for Split and LaunchDarkly: guesses.

---

## Sources (all accessed 2026-10-18)

- [of-intro] https://openfeature.dev/docs/reference/intro
- [of-eval-api] https://openfeature.dev/docs/reference/concepts/evaluation-api
- [of-spec-eval] https://openfeature.dev/specification/sections/flag-evaluation
- [of-mid2026] https://openfeature.dev/blog/openfeature-mid-2026-update/
- [of-vercel-adapter] https://openfeature.dev/blog/vercel-flags-sdk-adapter
- [cncf-blog] https://www.cncf.io/blog/2023/12/19/openfeature-becomes-a-cncf-incubating-project/
- [flagd] https://flagd.dev/
- [ld-keys] https://launchdarkly.com/docs/home/account/environment/keys
- [ld-debt] https://launchdarkly.com/docs/guides/flags/technical-debt
- [unleash-tokens] https://docs.getunleash.io/concepts/api-tokens-and-client-keys
- [unleash-of-node] https://docs.getunleash.io/sdks/openfeature/node
- [flagsmith-ssr] https://docs.flagsmith.com/clients/server-side
- [gb-sdk] https://docs.growthbook.io/lib
- [configcat-sdks] https://configcat.com/docs/sdk-reference/overview/
- [posthog-local] https://posthog.com/docs/feature-flags/local-evaluation
- [harness-split] https://developer.harness.io/feature-management-experimentation/troubleshooting-and-resources/split-to-harness-migration/migrate-from-split-to-harness/split-to-harness
- [harness-sdk] https://developer.harness.io/docs/feature-management-experimentation/sdks-and-infrastructure/
- [harness-of] https://developer.harness.io/docs/feature-management-experimentation/sdks-and-infrastructure/openfeature/
- [optimizely-init] https://docs.developers.optimizely.com/feature-experimentation/docs/initialize-sdk-javascript
- [flipt-lic] https://docs.flipt.io/v2/licensing
- [aws-ac] https://docs.aws.amazon.com/appconfig/latest/userguide/appconfig-creating-configuration-and-profile-feature-flags.html
- [azure-fm] https://learn.microsoft.com/en-us/azure/azure-app-configuration/feature-management-overview
- [fb-rc] https://firebase.google.com/docs/remote-config/server
- [vercel-flags] https://vercel.com/docs/flags
- [fowler] https://martinfowler.com/articles/feature-toggles.html
- [trunk-flags] https://trunkbaseddevelopment.com/feature-flags/
- GitHub API / raw LICENSE files for Unleash/unleash, Flagsmith/flagsmith, growthbook/growthbook, flipt-io/flipt, open-feature/flagd, PostHog/posthog (api.github.com, raw.githubusercontent.com).
- npm registry, PyPI JSON API, proxy.golang.org for package names and versions.
- Web-search-only claims: Statsig/OpenAI (e.g. https://aibusiness.com/generative-ai/openai-acquires-startup-for-1-1b-hires-ceo), DevCycle provider (https://docs.devcycle.com/sdk/server-side-sdks/node/node-openfeature), AWS AppConfig community provider (https://github.com/lavenderses/aws-appconfig-openfeature-provider-java).
