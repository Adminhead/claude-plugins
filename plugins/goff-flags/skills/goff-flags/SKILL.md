---
name: goff-flags
description: Writes and reviews GO Feature Flag flag files (YAML, JSON, TOML), covering variations, targeting rules and query syntax, percentage, progressive and scheduled rollouts, experimentation, metadata, bucketingKey, the evaluation context and the go-feature-flag-cli lint, evaluate and manifest commands. Use for a `*.goff.yaml` file, "GO Feature Flag", "GOFF flag", "flag file", "targeting rule", "defaultRule", "percentage rollout", "progressive rollout", "scheduled rollout", "bucketingKey", "targetingKey", "go-feature-flag-cli lint", or a flag that evaluates to the wrong variation. Not for running or configuring the relay proxy, retrievers, exporters or notifiers (goff-relay-proxy), OpenFeature SDK and provider code (goff-sdk), generic flag use in app code (feature-flags), or finding and removing stale flags (flag-hygiene).
---

# GO Feature Flag flag files

Flags live in one file (YAML, JSON or TOML; use the extension `.goff.yaml`). The top-level key is the flag name and must be unique. The relay proxy reads the file; this skill covers only the file and how to test it.

Not for: relay proxy config and retrievers (`goff-relay-proxy`), SDK and provider code (`goff-sdk`), generic flag practice (`feature-flags`), stale flag cleanup (`flag-hygiene`).

## Rules

1. Only use fields listed in [references/fields.md](references/fields.md). `prerequisite` is not in the docs or JSON schema; do not generate it. Do not use `converter` (purpose undocumented).
2. Every flag needs `variations` and `defaultRule`. All variations of one flag must have the same type (string, int, float, bool, object or array), and the type never changes once the flag is in use.
3. Every rule in `targeting` needs a `query`. `query` is ignored in `defaultRule`.
4. `targeting` is evaluated in order and the first match wins. Put specific rules before broad ones.
5. A rule needs at least one of `variation`, `percentage` or `progressiveRollout`. If several are set, `progressiveRollout` beats `percentage`, which beats `variation`.
6. Use camelCase `bucketingKey`, not `bucket-key`. For the rule-level switch use `disable: true`; the docs table spells it `disabled` with an odd default, so confirm with `lint`.
7. Run `go-feature-flag-cli lint` after every edit and `evaluate` for every rule you touched.

## Authoring flow

1. Read the existing flag file and copy its naming, variation names and metadata style. Find the evaluation contexts callers actually send before writing a query; only attributes in the context are available to a query, and a missing attribute means the query does not match.
2. Name variations for meaning (`enabled`/`disabled`, `low`/`high`), not `true`/`false` or `a`/`b`.
3. Pick the simplest strategy: a `variation` for a fixed answer, `percentage` for a split, `progressiveRollout` for a ramp between two dates, `scheduledRollout` for a change of any field at a date, `experimentation` for a bounded window. Details and valid YAML in [references/rollouts.md](references/rollouts.md).
4. Set the `defaultRule` to the safe outcome. It serves everyone no rule matched.
5. Add `metadata` with a `description` and an issue link, and a `name` on each rule you may later patch from a `scheduledRollout`. The rule `name` also appears as `evaluatedRuleName` in evaluation metadata.
6. Lint and evaluate (below), then show the user the command output.

## Queries

`query` is either nikunjy/rules syntax (`plan eq "pro" and country ne "FR"`) or a JsonLogic expression written as a string. Operators are case-insensitive: `eq`, `ne`, `lt`, `gt`, `le`, `ge`, `co`, `sw`, `ew`, `in`, `pr`, `not`, combined with `and`, `or` and parentheses. Full list and examples in [references/queries.md](references/queries.md). Quote string values. The syntax of `in` list literals is not shown on the docs pages: check the nikunjy/rules README before using it.

## Context and bucketing

- `targetingKey` is mandatory in every evaluation context (a missing one gives `TARGETING_KEY_MISSING`) and should be a stable id.
- Percentages hash `targetingKey + flag name`. With `bucketingKey` set, the hash uses that context attribute instead (a string, nested with dots such as `company.id`). If the context lacks that attribute, rules are not evaluated and the SDK default is returned.
- With more than two variations, changing a percentage moves every bucket boundary and can reassign users.
- Do not put your own data under a context key named `gofeatureflag`; it is reserved (`currentDateTime`, `flagList`, `exporterMetadata`). See [references/fields.md](references/fields.md).

## Verify with `go-feature-flag-cli`

```
go-feature-flag-cli lint flags.goff.yaml --format=yaml
go-feature-flag-cli evaluate --config=flags.goff.yaml --format=yaml \
  --flag=my-flag --ctx='{"targetingKey":"user-1","plan":"pro"}'
```

- `lint` validates the file (yaml, json or toml); run it in CI too (`go-feature-flag/gofeatureflag-lint-action@v1`).
- `evaluate` needs `--config` and `--ctx`; omit `--flag` to evaluate all flags. No relay proxy is needed.
- To test time-based rollouts, add `gofeatureflag.currentDateTime` (RFC3339) to the context.
- `generate manifest --config=<file> --flag_manifest_destination=<out.json>` is experimental. It includes only flags with `metadata.defaultValue`; `metadata.description` is optional.
- If the CLI is not installed (brew, scoop or the `gofeatureflag/go-feature-flag-cli` image), say so and review by hand instead of claiming the file is valid.

## Review checklist

- Duplicate or reused flag key; variations of mixed types; a variation name referenced by a rule that does not exist.
- A rule without `query`, or a broad rule above a specific one.
- `percentage` values that do not mean what the author thinks (they are fractions of their sum; buckets are laid out in reverse alphabetical variation order).
- `progressiveRollout` or `scheduledRollout` dates in the wrong order or without a date (a step with no `date` is skipped). Percentage handling in `progressiveRollout` is non-intuitive and its optionality is disputed between docs and schema: set it explicitly and lint.
- Experimentation window missing `start` or `end`.
- `bucketingKey` attribute that callers do not send.
- A flag left at 100 percent after rollout: tell the user to remove it (`flag-hygiene`). Keep flags small and temporary.

## References

- [references/fields.md](references/fields.md): every flag-level and rule-level field, value types, reserved context fields, reasons and error codes. Read when writing or checking any field.
- [references/queries.md](references/queries.md): nikunjy/rules operators, JsonLogic form, context behaviour. Read when writing or debugging a `query`.
- [references/rollouts.md](references/rollouts.md): copyable YAML for percentage, progressive, scheduled, experimentation, bucketingKey, metadata, disable and a JSON flag. Read when choosing or writing a rollout.
