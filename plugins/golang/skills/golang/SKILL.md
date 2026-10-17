---
name: golang
description: Writes, reviews, debugs and tests Go code (packages, errors, interfaces, context, goroutines, modules, Go tests). Use for any work in *.go, *_test.go or go.mod, "review this Go package", a `go test -race` data race, a goroutine leak, a shutdown hang or a cancellation bug.
---

# Go

Keep the existing observable contract (API, error behavior, cancellation, concurrency guarantees) unless the request changes it.

Not for: benchmarks and profiling (`golang-performance`), cobra/viper CLIs (`golang-cli`), generic test strategy (`unit-testing`), CI configuration, or Postgres schema and query tuning (`postgres`).

## Orient

- Read `go.mod` (the `go` and `toolchain` lines), the changed package and its callers, nearby `_test.go` files, and any Makefile or Taskfile that defines supported commands.
- Don't use an API newer than the module's declared `go` version, even if the local toolchain has it. Examples include range-over-func (1.23), `min`/`max` builtins (1.21), and per-iteration loop variables (1.22).
- Find callers and implementations with the codebase-memory tools when the repo is indexed (`search_graph` for symbols, `trace_path` for callers and callees, `get_code_snippet` for source). Otherwise use the LSP tool (gopls), `go doc`, or Grep.
- For third-party module APIs, check docs with Context7 (`resolve-library-id`, then `query-docs`) or `go doc <pkg>.<Symbol>` against the version in `go.mod`.
- Reproduce with the narrowest command, such as `go test ./pkg/... -run 'TestName/subcase' -count=1`.
- Before editing a definition, list its references (gopls or `trace_path`). After each edit, check diagnostics or `go build ./...`.

## Packages

- Keep code in the package that owns its behavior and data. `main` handles startup, config, wiring and exit codes; reusable behavior lives in ordinary packages.
- Use `internal/` only to enforce repository-private imports. A trivial tool can use stdlib `flag`; anything bigger goes to `golang-cli`.
- Put multiple binaries under `cmd/<name>`, each with a `main` that only parses flags, wires dependencies and calls `Run`. Keep the module path equal to the repository URL, and use `go.work` only for local multi-module development.
- Add a package, exported identifier, module or `go.work` only when current callers need that boundary.
- Break import cycles by moving the shared type to the narrowest package that can own it, never to a catch-all `util` or `common`.

## APIs and interfaces

- Start with concrete types and functions. Accept interfaces and return structs.
- Define a small interface in the consuming package only when that consumer needs substitution, such as a real external dependency plus a test double. Include only the methods it calls.
- Make zero-value usability, constructors and nil semantics explicit where callers can see them. Treat every exported identifier as a compatibility promise.
- Use one receiver kind per type, pointer if any method needs it. Embed a type only when promoting its entire method set is intended; otherwise use a named field.
- Add `var _ Iface = (*T)(nil)` when nothing else in the package proves a type satisfies an interface. Pass types that hold a lock or other no-copy state only by pointer.
- Use generics when the type set is known and the alternative is `any` plus assertions. For optional behavior, assert a narrow interface (the `io.Flusher` pattern) instead of widening the main one.
- Names: no stutter (`user.Service`, not `user.UserService`), initialisms in one case (`ID`, `URL`, `HTTP`), `ErrX` for sentinels and `XError` for error types, lowercase error strings without trailing punctuation, and an import alias only on a collision. Make the zero value of an enum mean "unknown", with real values starting at 1.
- Nil slices and maps are idiomatic. Turn them into empty values only at JSON boundaries, where nil encodes as `null` and an API promising an array needs `[]`.
- Doc comments say why and what constraints apply, not a paraphrase of the signature. Add a `doc.go` only for a multi-file package.

## Context

- Take `ctx context.Context` as the first parameter for request-, job- or caller-scoped I/O, blocking work, or child work. Pass the received context through.
- Derive a child context only to add a deadline, a cancellation boundary or a request-scoped value. Always `defer cancel()`.
- Never store a context in a struct, swap a supplied ctx for `context.Background()`, pass `nil`, or use context values as optional parameters.
- At the process root, use `context.Background()` or `signal.NotifyContext`. Use `context.WithoutCancel` (1.21+) for work that must outlive the request, with its own timeout, and `context.AfterFunc` for cleanup when a context ends.
- Key context values with an unexported named type behind typed accessors. Put an explicit timeout on every call to an external system.

## Errors

- Return ordinary failures as `error`. Panic only for unrecoverable programmer or process invariants, and `recover` only at an intentional request, worker or process boundary.
- Check every returned error, including from `Close` on writers where it matters.
- Wrap with `fmt.Errorf("op: %w", err)` only where the context helps locate the failing layer and callers may need `errors.Is`/`errors.As`. Use `%v` to deliberately hide the cause.
- Use sentinel errors for conditions callers branch on, and typed errors when callers need fields. Use `errors.Join` only when several independent failures all matter. On Go 1.26+, `errors.AsType[*MyErr](err)` replaces `errors.As` with a typed result.
- Handle an error once. At an application boundary, map it to a response or exit code and log it there with a stable message and attributes (`slog.Error("load user", "id", id, "err", err)`). Never put internal error text in a user-facing response.

## Goroutines

- Before writing `go`, name the goroutine's owner, input, result or error path, cancellation signal, and the event that proves it exited. Stay synchronous unless concurrency serves a stated need.
- Bound fan-out with `errgroup.WithContext` plus `SetLimit`. Only the sending owner closes a channel. Every blocking send, receive or timer wait selects on `ctx.Done()` or another exit path.
- Read [references/concurrency.md](references/concurrency.md) before adding a goroutine, channel, lock, errgroup or worker pool, and when debugging a race, leak, deadlock or shutdown hang. It has the primitive-by-job table, errgroup details and the graceful-shutdown sequence.

## Dependencies

Prefer existing dependencies, then the stdlib. Pass dependencies as constructor arguments wired in `main`, never through globals or `init`. Read [references/dependencies.md](references/dependencies.md) when adding, updating or retracting a module, or choosing a DI approach for a large service graph.

## Tests

- Keep `_test.go` next to the code. Prefer external `package x_test` tests through the public API, and use same-package tests only when unexported behavior must be reached.
- Inject time, randomness, I/O and processes through narrow seams. Don't sleep or contact real services. Use stdlib `testing` unless the repo already uses testify.
- Read [references/testing.md](references/testing.md) when adding or reviewing table tests, golden files, build-tagged integration tests, benchmarks, fuzz targets, or concurrent-code tests.

Use `golang-performance` for benchmarks, profiling and optimization. Optimize only against a measured bottleneck.

## Validate

- `gofmt -l` (or the repo's `goimports`/`gofumpt`) on changed files, plus `go vet ./pkg/...`.
- The narrowest `go test` that proves the contract, then `go test ./...` when shared code or the public boundary changed.
- `go test -race` for any change touching goroutines or shared state. A race report is a defect, not a flake. The detector only covers exercised paths.
- Run `staticcheck` or `golangci-lint run` when the repo configures them. Suppress with `//nolint:<linter> // <reason>` only for a justified false positive, never for `gosec`, `bodyclose` or `sqlclosecheck` to get a pass. See [references/lint.md](references/lint.md).
- Triage failures as a product defect, wrong expectation, race, hang or leak (`-timeout` plus the goroutine dump), toolchain/version mismatch, or missing prerequisite.

## References

- [references/pitfalls.md](references/pitfalls.md) when writing or reviewing code with interfaces returning errors, maps, slices, `defer` in loops, numeric conversions, timers, context keys or receivers.
- [references/security.md](references/security.md) when code handles untrusted input, file paths, commands, templates, outbound requests, crypto or passwords.
- [references/debugging.md](references/debugging.md) when a crash, hang, leak, slow path or intermittent failure has no known cause.
- [references/database.md](references/database.md) when writing `database/sql`, `sqlx` or `pgx` code.
- [references/grpc.md](references/grpc.md) when the code imports `google.golang.org/grpc`.
- [references/modernize.md](references/modernize.md) when modernizing code, bumping the `go` directive, or fixing a deprecation warning.
- [references/refactoring.md](references/refactoring.md) when renaming, moving, extracting or inlining across packages.
- [references/lint.md](references/lint.md) when configuring golangci-lint or deciding whether to suppress a finding.

Adapted in part from [samber/cc-skills-golang](https://github.com/samber/cc-skills-golang) and [wshobson/agents](https://github.com/wshobson/agents) go-concurrency-patterns (both MIT; see LICENSE at the plugin root).
