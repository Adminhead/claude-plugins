# Go linting

Read this when setting up or changing golangci-lint, interpreting lint output, or deciding whether to suppress a finding. If the repo already has a `.golangci.yml` or `.golangci.yaml`, follow it. Don't replace it with the starter below.

Sources: <https://golangci-lint.run/docs/configuration/file/>, <https://golangci-lint.run/docs/linters/>, <https://golangci-lint.run/docs/linters/false-positives/>.

## Commands

- `golangci-lint run ./...` runs the configured linters. `--fix` applies auto-fixes.
- `golangci-lint fmt ./...` runs the configured formatters (v2).
- `golangci-lint linters` lists what the current config enables.
- `golangci-lint migrate` converts a v1 config to v2. `golangci-lint config verify` checks a config against the schema.

## v2 config shape

```yaml
version: "2"
linters:
  default: standard        # or none, all, fast
  enable:
    - errorlint
    - nolintlint
    - bodyclose
    - sqlclosecheck
    - noctx
  settings:
    nolintlint:
      require-explanation: true
      require-specific: true
  exclusions:
    presets: [std-error-handling]
formatters:
  enable: [gofumpt, goimports]
issues:
  new-from-rev: origin/main
```

- Formatters (`gofmt`, `gofumpt`, `goimports`) live under `formatters`, not `linters`.
- `gosimple` and `stylecheck` no longer exist as separate linters. Their checks are part of `staticcheck`.
- `issues.new-from-rev` (also the `--new-from-rev` flag) reports only issues introduced after a git revision. Use it to adopt linting on a legacy codebase without fixing every old finding first.
- Exclusion presets are `comments`, `common-false-positives`, `legacy`, and `std-error-handling`. Prefer a preset or a path rule under `linters.exclusions` over many inline suppressions.
- `modernize` is available as a linter in recent v2 releases. See `modernize.md`.

## Suppressing findings

- Fix the cause first. A suppression is for a false positive or an accepted, documented trade-off.
- Name the linter and give a reason: `//nolint:errcheck // best-effort flush on shutdown`. There are no spaces around `nolint` or the colon, and a bare `//nolint` silences everything on the line. Enable `nolintlint` to enforce both rules.
- Don't suppress `gosec`, `bodyclose`, or `sqlclosecheck` findings to get a green run. They point to leaks and security flaws. If one is truly wrong, explain why in the comment.
