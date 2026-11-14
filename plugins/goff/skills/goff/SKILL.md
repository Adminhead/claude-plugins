---
name: goff
description: "Works with GO Feature Flag: flag files, the relay proxy and OpenFeature SDK wiring. Use for GOFF `*.goff.yaml` flags (targeting, rollouts, `go-feature-flag-cli lint`), the relay proxy (`goff-proxy.yaml`, retrievers, exporters, `authorizedKeys`, flagsets, Helm), and OpenFeature providers or the Go `ffclient` module in app code (`targetingKey`). Not for vendor-neutral flag design, tests and removal (feature-flags), stale-flag audits (flag-hygiene) or other vendors."
---

# GO Feature Flag

GO Feature Flag (GOFF) flags live in a YAML, JSON or TOML file. A relay proxy loads it through retrievers and serves it over HTTP and OFREP. Apps evaluate through an OpenFeature SDK plus a GOFF provider; Go-only apps may embed the Go module instead. Facts here come from the GOFF docs (v1.58.1) and repo files; nothing was run against a live proxy, and items marked verify are unconfirmed.

Vendor-neutral flag practice (design, testing both states, removal) is the `feature-flags` skill; repo-wide stale-flag audits are `flag-hygiene`.

## Route the task

Read the reference for the task before writing anything.

- Flag files:
  - [references/flags-authoring.md](references/flags-authoring.md): authoring flow, CLI lint and evaluate, review checklist. Read for any flag-file change or review.
  - [references/flags-fields.md](references/flags-fields.md): every flag and rule field, reserved context keys, reasons, error codes.
  - [references/flags-queries.md](references/flags-queries.md): targeting query syntax. Read when writing or debugging a `query`.
  - [references/flags-rollouts.md](references/flags-rollouts.md): copyable YAML for percentage, progressive, scheduled and experimentation rollouts, bucketingKey, metadata, JSON.
- Relay proxy:
  - [references/proxy-operations.md](references/proxy-operations.md): configure, run, test, endpoints, deploy, debug, gotchas. Read first for any proxy task.
  - [references/proxy-config-keys.md](references/proxy-config-keys.md): every config option with type and default.
  - [references/proxy-components.md](references/proxy-components.md): retriever, exporter and notifier fields.
  - [references/proxy-examples.md](references/proxy-examples.md): full example configs, Docker compose, Helm.
- SDKs and providers:
  - [references/sdk-overview.md](references/sdk-overview.md): choose the integration, in-process vs remote, tracking, tests. Read first for any app-code task.
  - Per language, after the overview: [Go](references/sdk-go.md), [Node.js and NestJS](references/sdk-node.md), [Java, Kotlin and .NET](references/sdk-jvm-dotnet.md), [Python, PHP, Ruby, Rust](references/sdk-python-php-ruby-rust.md), [browser, React, Angular, Swift, Android](references/sdk-client.md).

## Facts that apply everywhere

- `targetingKey` is mandatory in every evaluation context (missing gives `TARGETING_KEY_MISSING`) and must be a stable unique id (user, session), not a random value per request.
- Evaluation always returns a value. On any error, a missing or disabled flag, or a provider that is not ready, the caller gets its own default, so make the default the safe path.
- Only attributes in the context reach a query; a missing attribute means the rule does not match.
- Percentages hash `targetingKey + flag name`. With `bucketingKey` set, the hash uses that context attribute instead (a string, dotted for nesting such as `company.id`); if the context lacks it, rules are skipped and the default is returned. With more than two variations, changing a percentage moves every boundary and can reassign users.
- The context key `gofeatureflag` is reserved (`currentDateTime`, `flagList`, `exporterMetadata`); never use it for your own data.
- The proxy's `evaluationContextEnrichment` is merged into every context and overrides same-named fields.

## Flag file rules

1. Use only fields listed in flags-fields.md. `prerequisite` is not in the docs or JSON schema, so do not generate it; do not use `converter` (purpose undocumented).
2. Every flag needs `variations` and `defaultRule`. Variations of one flag share one type, and the type never changes once the flag is in use. Every rule in `targeting` needs a `query`; it is ignored in `defaultRule`.
3. `targeting` is first match wins: specific rules before broad ones. A rule needs one of `variation`, `percentage` or `progressiveRollout`; if several are set, `progressiveRollout` beats `percentage`, which beats `variation`.
4. Use camelCase `bucketingKey`. The rule-level switch is `disable: true`; the docs table spells it `disabled`, so confirm with lint.
5. After every edit run `go-feature-flag-cli lint <file> --format=yaml`, and `evaluate` for every rule you touched, and show the user the output. If the CLI is not installed, say so and review by hand instead of claiming the file is valid.
6. Quote string values in queries. The `in` list literal syntax is not on the docs pages: check the nikunjy/rules README first.

## Relay proxy rules

1. Never commit API keys, retriever tokens (GitHub, GitLab, Bitbucket), cloud credentials, DB URIs with passwords or webhook secrets. Use env vars or the platform's secrets (K8s Secret, Helm values from a secret).
2. Set `authorizedKeys` for anything beyond localhost: with none set the proxy is fully open. Use separate keys for `evaluation` and `admin`; `/admin/v1/*` is unreachable without an admin key.
3. Use the current keys: `server.*`, `swagger.*`, `authorizedKeys`, plural `retrievers`, `exporters`, `notifiers`. Older docs show `monitoringPort`, `enableSwagger`, `startAsAwsLambda`, `apiKeys`, `listen` and singular `notifier:`; migrate them when you see them.
4. With `flagSets`, the top-level `retrievers`, `exporters` and `notifiers` are ignored and sets do not inherit: give each set its own and at least one `apiKeys` entry. `name` defaults to a generated UUID; set it when the set is changed at runtime or a retriever matches on it.
5. Ask first: calling the admin refresh, editing a shared or production proxy config, changing flags on a shared proxy.

## SDK rules

1. Detect first: the repo's language, existing OpenFeature setup (`SetProvider` calls, a flag wrapper, constants, test helpers) and any GOFF provider already installed. Reuse that client, wrapper and context shape; do not add a second provider or SDK.
2. Copy package and option names from the language reference; never invent them. Provider versions there may be stale, so check the registry.
3. Never put proxy API keys in client code, tests or committed files; read them from the environment or secret store the repo uses. Pass `apiKey` when the proxy has `authorizedKeys` or flagSets (a flagSet request without a key fails).
4. Await provider readiness at startup; evaluating earlier returns defaults.
