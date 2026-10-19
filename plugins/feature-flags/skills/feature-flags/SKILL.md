---
name: feature-flags
description: Adds, uses, tests and removes feature flags (toggles, kill switches) in application code with the repo's existing flag tool, or OpenFeature when there is none, and knows the common flag platforms. Use when asked to put a change behind a feature flag or toggle, "feature flag", "feature toggle", "kill switch", "gradual rollout of a feature in code", "dark launch", test both flag paths, remove or clean up a stale flag, or when code or config mentions LaunchDarkly, Unleash, Flagsmith, GrowthBook, PostHog, ConfigCat, Statsig, Harness FME (Split), flagd or OpenFeature. Not for deploy rollout plans and canaries (rollout-plan), branching models (trunk-based), or deprecating an API or feature (deprecation-migration).
---

# Feature flags

Guard code with a flag so it can ship dark, roll out gradually or be switched off, then delete the flag once it has done its job. Work with the flag system the repo already has.

## Rules

1. Use the repo's existing flag tool and conventions. Never add a new platform, vendor SDK or dependency without the user's go-ahead. If nothing exists, suggest OpenFeature with a local provider (flagd file, in-memory or env-var) and wait for the answer.
2. Server SDK keys, secret tokens and service credentials never go in client code, committed files, tests or logs. Read them from the environment or the secret store the repo already uses. Client-side keys differ per platform; see [references/platforms.md](references/platforms.md) before putting any key in browser or mobile code.
3. Never create, change, toggle or archive a flag in a shared or production dashboard, and never call a platform management API for it, without the user's go-ahead. Write the flag change as a diff or instructions instead.
4. Do not wrap secrets, static config or large payloads in flags, and do not use a flag for a one-line change.

## 1. Detect the existing tool

Search before writing: dependency manifests and lockfiles, imports of flag clients, config files, env var names, CI and IaC. Detection hints per platform are in [references/platforms.md](references/platforms.md). Then find how existing flags are defined, evaluated and tested, and copy that shape (wrapper function, constants file, naming, context fields). If the repo has a flag registry or docs listing owners and expiry, add to it.

If several tools appear (a migration in progress), use the one the newest flags use and say which.

## 2. Add a flag

1. Classify it: release (hide unfinished work, short-lived), experiment, ops/kill switch (can be long-lived), permission/entitlement (long-lived). Temporary flags get an owner and a removal date.
2. Name it for the behaviour in the repo's casing, for example `checkout-new-tax-engine`. Put the key in one constant, never as a string literal at several call sites.
3. Choose the default as the safe path. The default is what users get when the flag service is down or the flag is missing. New feature: off. Kill switch protecting something that must keep working: on. Off means old behaviour, on means new behaviour.
4. Define the flag where the repo defines flags (flag file, code registry, or instructions for the dashboard per rule 3).
5. Evaluate at one decision point close to where behaviour diverges, and pass the result down instead of re-evaluating inside loops or deep helpers. For a flag that touches many places, branch once at the top and select an implementation (strategy or branch by abstraction) rather than scattering `if`.
6. Supply evaluation context (user or tenant key, plan, environment) only with fields already used by the repo; do not send personal data the targeting does not need. Server-side evaluation stays on the server; send the browser only the result.
7. Keep the old path working and unchanged. Do not couple the flag to a schema change that cannot run with the flag off; use expand/contract migrations (deprecation-migration).

Done when: the flag key is defined once, the default is the safe path, and the old behaviour is untouched when the flag is off.

## 3. Test

1. Test both states: flag off (legacy behaviour, must be unchanged) and flag on (new behaviour). Add tests next to existing tests for the guarded code.
2. Set flag values through the repo's test hook or a test provider (OpenFeature `InMemoryProvider`, a flagd file, the platform's test or local mode), never the network. Reset after each test. Patterns in [references/openfeature-and-testing.md](references/openfeature-and-testing.md).
3. Test the default path: provider unavailable or flag missing returns the safe default.
4. Combinations: test each flag alone, the all-new-off baseline, and the pairs that touch the same code. Do not enumerate every combination.
5. Run the changed tests and the suites that cover the guarded code; report the commands and results.

## 4. Remove a flag

Do this when the rollout is finished, the experiment is decided, or the flag is expired. Find stale flags by owner/expiry in the registry, by git age, or when the user names one.

1. Confirm with the user (or the dashboard state they report) which branch won and that the flag is fully on or off in every environment. Never assume from code alone.
2. Search the whole repo for the key, its constant and wrappers: code, tests, flag files, config, IaC, docs, dashboards-as-code.
3. Keep the winning branch, delete the losing branch and the flag evaluation, delete tests of the dead path and unwrap the tests of the live path.
4. Delete the flag definition, constant, registry entry and any now-unused context fields, imports or helper code.
5. Search again for the key; zero hits is the completion criterion, then run the tests.
6. Tell the user to archive the flag in the platform after the deploy (rule 3). Archive rather than delete when the platform allows, so the key cannot be reused by accident.

## Which platform

Only when the user asks for a recommendation and the repo has none: prefer OpenFeature in code, with flagd (open source, file-based) or an env-var provider for a start, so a hosted platform can be added later through a provider without touching call sites. Platform status, licences, SDK packages and OpenFeature providers are in [references/platforms.md](references/platforms.md). Several vendors changed hands recently (Split is now Harness FME; OpenAI announced buying Statsig in 2025), so check a platform's current docs before relying on a detail.

## Gotchas

- A flag service outage, or an SDK that has not finished initialising, returns the default. A wrong default is a production incident.
- Local-evaluation server SDKs download all rules, so their keys are secret; client SDKs get one user's results only.
- Do not reuse an old flag key for a new feature; stale targeting applies.
- A flag cannot be removed until every environment and every deployed version agrees on the outcome.
- Changing a flag's rollout percentage or hashing can move users between variants.

## References

- [references/platforms.md](references/platforms.md): platform table, per-platform SDK packages, OpenFeature providers, detection hints, self-hosting. Read when detecting a tool, choosing one, or handling keys.
- [references/openfeature-and-testing.md](references/openfeature-and-testing.md): OpenFeature concepts, setup, in-memory provider tests, hooks, flagd. Read when adding OpenFeature or writing flag tests.
