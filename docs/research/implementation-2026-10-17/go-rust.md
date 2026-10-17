# Batch go-rust report

## Plugins created

| Name | Type | Description (exactly as in plugin.json) | Sources | Deps |
| --- | --- | --- | --- | --- |
| `golang` | S | Go language skill: packages, errors, interfaces, context, goroutines and shutdown, modules, tests, with references for pitfalls, security, database/sql, gRPC, linting and modernizing. | archive coding-go/skills/golang; samber/cc-skills-golang (MIT, attribution kept); wshobson go-concurrency-patterns details.md (MIT, errgroup + graceful-shutdown details only) | none |
| `golang-cli` | S | Go command-line tools with cobra and viper: command tree and hooks, flag, env and config precedence, output and exit codes, signal shutdown, testable commands. | archive coding-go/skills/golang-cli (adapted in part from samber/cc-skills-golang, MIT) | none |
| `golang-performance` | S | Measurement-first Go performance: benchstat comparisons, pprof and trace reading, escape analysis, GC and GOMEMLIMIT tuning, and CI regression checks. | archive coding-go/skills/golang-performance (adapted in part from samber/cc-skills-golang, MIT) | none |
| `rust` | S | Rust language skill: ownership and lifetimes, error design, traits and modules, Cargo features, async and concurrency, unsafe review, clippy and measured performance. | archive coding-rust/skills/rust | none |

gopls / rust-analyzer stay as golang-meta / rust-meta deps (coordinator's job), not plugin deps.

## Changes

- golang: body trimmed 139 -> 94 lines. Goroutines/channels section (primitive table, rules) moved to new `references/concurrency.md`, plus mined deltas: errgroup ctx semantics, first-error-only `Wait`, `SetLimit` before `Go` / `TryGo`, index-addressed results without a mutex, pre-1.22 loop-var copy, ctx dead after `Wait`; graceful shutdown with `signal.NotifyContext`, bounded wait, `http.Server.Shutdown` with a fresh timeout ctx and `ErrServerClosed`, reverse-order teardown. Dependencies + DI sections moved to new `references/dependencies.md`. "Not for" list moved into body. Attribution line at the end of SKILL.md.
- All four: "Efficient X" headings removed; `codegraph_explore`/`.codegraph/` replaced with codebase-memory (`search_graph`, `trace_path`, `get_code_snippet`) with LSP/Grep fallback; descriptions rewritten in third person, 286-311 chars; cross-refs renamed (coding-core:problem-solving -> problem-solving, coding-core:coding -> coding, db:database-design -> db-schema-design, db:postgres -> postgres, testing:unit -> unit-testing, observability:instrumentation -> observability-instrumentation, github-admin:actions -> gh-actions, coding-go:* -> golang / golang-cli / golang-performance).
- LICENSE (MIT): golang (Samuel Berthe 2026 + Seth Hobson 2024), golang-cli and golang-performance (Samuel Berthe 2026). Copyright line fetched from samber/cc-skills-golang LICENSE on GitHub. rust had no third-party attribution in the archive, so no LICENSE.
- Evals moved: trigger-golang-1/2 -> plugins/golang/evals; golang-cli-vs-golang -> plugins/golang-cli/evals; golang-performance-vs-golang -> plugins/golang-performance/evals. Grader regexes now `"golang:golang"`, `"golang-cli:golang-cli"`, `"golang-performance:golang-performance"` (same `plugin:skill` form other implementers used, e.g. `terraform:terraform`).

## Version checks

- cobra latest v1.10.2, viper latest v1.21.0 (proxy.golang.org `@latest`, 2026-10-17). Matches the archive's tested versions; SKILL.md note updated to the exact patch versions.
- Go 1.26 release notes (go.dev/doc/go1.26): confirmed `errors.AsType` and `//go:fix inline` in the rewritten `go fix`. No Go 1.27 released yet.

## Validation

- `claude plugin validate --strict plugins/{golang,golang-cli,golang-performance,rust}`: all passed.
- `.claude/skills/skill-authoring/scripts/validate_skill.py` on each skill dir: all valid (links resolve).
- grep for codegraph, claude-mem, coding-core:, coding-go:, github:, github-admin, testing:, db:, observability:, Efficient, dynamic-workflows: no matches.
- No scripts in these plugins; no tests to run. Evals not executed (`claude plugin eval` not run).

## Deviations

- golang-cli and golang-performance got samber MIT LICENSE files though the plan only names attribution for golang: the archive's third-party review (`archive/docs/research/third-party-skills-review.md` rows 108, 138) shows both were condensed from cc-skills-golang.
- Negative graders in each eval (e.g. `not-golang` in golang-cli) are kept, but only bite when the sibling plugin is also installed in the eval sandbox.

## Unverified / follow-ups

- Run `claude plugin eval` for the moved evals once registered.
- Trigger testing of the shortened descriptions in a fresh session not done.
- Rust skill facts (Miri, clippy flags) are stable and were not rechecked against docs.
