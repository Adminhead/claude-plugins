# OpenFeature and flag testing

Check the repo's installed OpenFeature SDK version and its docs before copying code; the specification moved to v0.9.0 in 2026 and SDK APIs changed (for example Python `set_provider()` became non-blocking and `set_provider_and_wait()` was added).

## Contents

- Concepts
- Minimal setup (Node)
- Defaults and errors
- Context
- Hooks
- flagd
- Testing

## Concepts

- Evaluation API: the client your code calls (`getBooleanValue(key, default, context)`).
- Provider: adapter to a flag system (vendor SDK, REST, or a local file). Swapping the provider does not change call sites.
- Evaluation context: targeting data (user or tenant key, plan, region). Static values set once at API or client level, per-evaluation values merged in.
- Hooks: before, after, error and finally callbacks around an evaluation, for validation, context enrichment, logging, telemetry.
- OFREP: vendor-neutral HTTP protocol for remote evaluation, with `@openfeature/ofrep-provider` and `openfeature-provider-ofrep`.

## Minimal setup (Node server, illustrative)

```ts
import { OpenFeature } from '@openfeature/server-sdk';
await OpenFeature.setProviderAndWait(provider);   // await readiness, do not evaluate before it
const flags = OpenFeature.getClient();
const on = await flags.getBooleanValue('checkout-new-tax-engine', false, { targetingKey: user.id });
```

Wrap the key in one constant or one function per decision (`useNewTaxEngine(ctx)`) so call sites never repeat the string.

## Defaults and errors

Typed getters never throw on evaluation problems; they return the default you pass and mark the details with an error code. Use `getBooleanDetails` (and the other `*Details` variants) in tests and logging to see `reason`, `variant` and `errorCode`. A provider that is not ready returns defaults, so wait for readiness at startup and decide what the app does if the provider never becomes ready.

## Context

Use `targetingKey` for the stable identifier used for percentage rollouts. Add only attributes the targeting rules need; do not send secrets or unneeded personal data to a third-party provider. In a server, build the context per request; do not store one request's context in a global.

## Hooks

Use a hook for cross-cutting needs: log every evaluation with reason, fail a test when an unknown flag is evaluated, add tenant context in one place. Register at API level for all clients or on one client.

## flagd

Open-source engine for local development, tests and self-hosting. Flags are defined in a file or other sources with variants, a default variant, and optional targeting rules; the app uses a flagd provider (in-process or RPC). Check the flagd docs for the current file schema before writing one. Do not put production targeting rules in a repo file without the user's approval.

## Testing

1. Prefer the OpenFeature in-memory provider (`InMemoryProvider` exported from `@openfeature/server-sdk`; other SDKs have an equivalent): create it with a map of flag key to variants and default variant, set it as the provider in test setup, and swap or reset it per test. Confirm the exact constructor in the installed SDK.
2. If the repo wraps flags in its own function, stub that function instead of the provider.
3. Platform SDKs usually have an offline, local or file mode (for example local files or test data sources); use it rather than hitting a hosted service. Check the platform docs; never use a real SDK key in tests.
4. Each guarded change needs: flag off equals old behaviour, flag on equals new behaviour, flag missing or provider failing equals the safe default.
5. For multiple flags, test the all-new-off baseline, each flag alone and the interacting pairs. Name tests after the flag so removal can find and delete them.
6. Reset provider state after each test to avoid leaks between tests running in the same process.
7. Optional expiry guard: a test that fails after a flag's expiry date (a "time bomb") keeps removal on the agenda; add it only if the repo already uses a flag registry.
