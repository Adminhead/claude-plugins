# Authoring and reviewing flag files

Flags live in one file (YAML, JSON or TOML; use the extension `.goff.yaml`). The top-level key is the flag name and must be unique. The relay proxy reads the file; this page covers the file and how to test it. Field rules are in flags-fields.md.

## Authoring flow

1. Read the existing flag file and copy its naming, variation names and metadata style. Find the evaluation contexts callers actually send before writing a query; only attributes in the context are available to a query, and a missing attribute means the query does not match.
2. Name variations for meaning (`enabled`/`disabled`, `low`/`high`), not `true`/`false` or `a`/`b`.
3. Pick the simplest strategy: a `variation` for a fixed answer, `percentage` for a split, `progressiveRollout` for a ramp between two dates, `scheduledRollout` for a change of any field at a date, `experimentation` for a bounded window. Valid YAML for each is in flags-rollouts.md.
4. Set the `defaultRule` to the safe outcome. It serves everyone no rule matched.
5. Add `metadata` with a `description` and an issue link, and a `name` on each rule you may later patch from a `scheduledRollout`. The rule `name` also appears as `evaluatedRuleName` in evaluation metadata.
6. Lint and evaluate (below), then show the user the command output.

## Verify with `go-feature-flag-cli`

```
go-feature-flag-cli lint flags.goff.yaml --format=yaml
go-feature-flag-cli evaluate --config=flags.goff.yaml --format=yaml \
  --flag=my-flag --ctx='{"targetingKey":"user-1","plan":"pro"}'
```

- `lint` validates the file (yaml, json or toml); run it in CI too (`go-feature-flag/gofeatureflag-lint-action@v1`).
- `evaluate` needs `--config` and `--ctx`; omit `--flag` to evaluate all flags. No relay proxy is needed. Run it once with a context that should match a rule and once with one that should not.
- To test time-based rollouts, add `gofeatureflag.currentDateTime` (RFC3339) to the context.
- `generate manifest --config=<file> --flag_manifest_destination=<out.json>` is experimental. It includes only flags with `metadata.defaultValue`; `metadata.description` is optional.
- If the CLI is not installed (brew, scoop or the `gofeatureflag/go-feature-flag-cli` image), say so and review by hand instead of claiming the file is valid.

## Review checklist

- Duplicate or reused flag key; variations of mixed types; a variation name referenced by a rule that does not exist.
- A rule without `query`, or a broad rule above a specific one (`targeting` is first match wins).
- `percentage` values that do not mean what the author thinks (they are fractions of their sum; buckets are laid out in reverse alphabetical variation order).
- `progressiveRollout` or `scheduledRollout` dates in the wrong order or without a date (a step with no `date` is skipped). Percentage handling in `progressiveRollout` is non-intuitive and its optionality is disputed between docs and schema: set it explicitly and lint.
- Experimentation window missing `start` or `end`.
- `bucketingKey` attribute that callers do not send.
- A flag left at 100 percent after rollout: tell the user to remove it (`flag-hygiene`). Keep flags small and temporary.
