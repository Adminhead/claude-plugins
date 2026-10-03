---
name: golang
description: Write, review, debug, or test Go code: package boundaries, errors, interfaces, context propagation, goroutine lifecycles, stdlib choices, and Go tests, with references for pitfalls, security, database/sql, gRPC, linting, modernizing, and debugging. Use for "write tests for this Go code", "review this Go package", a `go test -race` data race, a goroutine leak, a shutdown hang, or cancellation bugs, or any work in *.go, *_test.go, or go.mod. Not for generic test strategy (efficient:testing), benchmarks and profiling (efficient:golang-performance), cobra/viper CLIs (efficient:golang-cli), CI configuration, or Postgres schema and query tuning (efficient:postgres).
---

# Efficient Go

Keep the existing observable contract (API, error behavior, cancellation, concurrency guarantees) unless the request changes it.

## Orient

- Read `go.mod` (the `go` and `toolchain` lines), the changed package and its callers, nearby `_test.go` files, and any Makefile or Taskfile that defines supported commands.
- Don't use an API newer than the module's declared `go` version, even if the local toolchain has it. Examples include range-over-func (1.23), `min`/`max` builtins (1.21), and per-iteration loop variables (1.22).
- Find callers and implementations with `codegraph_explore` when `.codegraph/` exists. Otherwise use `go doc`, Grep, or the LSP tool (gopls) for references and implementers.
- For third-party module APIs, check docs with Context7 (`resolve-library-id`, then `query-docs`) or `go doc <pkg>.<Symbol>` against the version in `go.mod`.
- Reproduce with the narrowest command, such as `go test ./pkg/... -run 'TestName/subcase' -count=1`.
- Before editing a definition, list its references (gopls or `codegraph_explore`). After each edit, check diagnostics or `go build ./...`.

## Packages

- Keep code in the package that owns its behavior and data.
- `main` handles startup, config, wiring, and exit codes. Reusable behavior lives in ordinary packages.
- Use `internal/` only to enforce repository-private imports.
- For CLI and flag work, use `efficient:golang-cli`; a trivial tool can use stdlib `flag`.
- Put multiple binaries under `cmd/<name>`, each with a `main` that only parses flags, wires dependencies, and calls `Run`. Keep the module path equal to the repository URL, and use `go.work` only for local multi-module development.
- Add a package, exported identifier, module, or `go.work` only when current callers need that boundary.
- Break import cycles by moving the shared type to the narrowest package that can own it, never to a catch-all `util` or `common`.

## APIs and interfaces

- Start with concrete types and functions. Accept interfaces and return structs.
- Define a small interface in the consuming package only when that consumer needs substitution, such as a real external dependency plus a test double. Include only the methods it calls.
- Make zero-value usability, constructors, and nil semantics explicit where callers can see them.
- Treat every exported identifier as a compatibility promise.
- Use one receiver kind per type, pointer if any method needs it. Embed a type only when promoting its entire method set is intended, because embedding exports every method. Otherwise use a named field.
- Add `var _ Iface = (*T)(nil)` when nothing else in the package proves a type satisfies an interface.
- Pass and return types that hold a lock or other no-copy state only by pointer. `go vet` flags copies.
- Use generics when the type set is known and the alternative is `any` plus assertions. For optional behavior on a value, assert a narrow interface (the `io.Flusher` pattern) instead of widening the main one.
- Names: no stutter (`user.Service`, not `user.UserService`), initialisms in one case (`ID`, `URL`, `HTTP`), `ErrX` for sentinels and `XError` for error types, lowercase error strings without trailing punctuation, and an import alias only on a collision. Make the zero value of an enum mean "unknown", with real values starting at 1.
- Nil slices and maps are idiomatic. Don't turn them into empty values except at JSON boundaries, where nil encodes as `null` and an API promising an array needs `[]`.
- Doc comments say why and what constraints apply, not a paraphrase of the signature. Add a `doc.go` only for a multi-file package.

## Context

- Take `ctx context.Context` as the first parameter for request-, job-, or caller-scoped I/O, blocking work, or child work. Pass the received context through.
- Derive a child context only to add a deadline, a cancellation boundary, or a request-scoped value. Always `defer cancel()`.
- Never store a context in a struct, swap a supplied ctx for `context.Background()`, pass `nil`, or use context values as optional parameters.
- At the process root, use `context.Background()` or `signal.NotifyContext`, matching the app's lifecycle.
- Use `context.WithoutCancel` (1.21+) for work that must outlive the request, such as an audit write, and give it its own timeout. Use `context.AfterFunc` to run cleanup when a context ends.
- Key context values with an unexported named type and expose typed accessors. Put an explicit timeout on every call to an external system.

## Errors

- Return ordinary failures as `error`. Panic only for unrecoverable programmer or process invariants.
- Check every returned error, including from `Close` on writers where it matters.
- Wrap with `fmt.Errorf("op: %w", err)` only where the extra context helps locate the failing layer and callers may need `errors.Is`/`errors.As`. Use `%v` to deliberately hide the cause.
- Use sentinel errors (`var ErrX = errors.New(...)`) for conditions callers branch on, and typed errors when callers need fields. Use `errors.Join` only when several independent failures all matter.
- On Go 1.26+, `errors.AsType[*MyErr](err)` replaces `errors.As` with a typed result and no pre-declared variable.
- Never put internal error text in a user-facing response. Log the cause server-side with a stable message and attributes (`slog.Error("load user", "id", id, "err", err)`).
- Handle an error once. At an application boundary, map it to a response or exit code and log it there, not at every layer.
- `recover` only at an intentional request, worker, or process boundary.

## Goroutines and channels

- Before writing `go`, name the goroutine's owner, input, result/error path, cancellation signal, and the event that proves it exited.
- Stay synchronous unless concurrency serves a stated latency, throughput, or isolation need.
- Bound fan-out and queue sizes from a real limit. `errgroup.WithContext` plus `SetLimit` covers most fan-out.
- Only the sender that owns a channel closes it.
- Every blocking send, receive, or timer wait needs a `select` on `ctx.Done()` or another exit path.
- Use the simplest synchronization that works. Keep locks out of blocking I/O, and wait for workers (`WaitGroup`, `errgroup.Wait`) before releasing what they depend on.
- Pick the primitive by the job:

| Job | Use |
| --- | --- |
| Hand data or ownership between goroutines | Channel |
| Protect shared fields | `sync.Mutex`, or `RWMutex` for read-heavy state (it can't upgrade a read lock to a write lock) |
| Counter or flag | Typed atomics (`atomic.Int64`, `atomic.Bool`) |
| Wait for goroutines that can't fail | `sync.WaitGroup` (`wg.Go` on 1.25+) |
| Wait, collect the first error, cancel siblings, or limit concurrency | `errgroup` with `WithContext` and `SetLimit` |
| One-time init | `sync.Once`, `OnceFunc`, `OnceValue` |
| Many callers for the same load | `singleflight` |

- Call `wg.Add` before the `go` statement, not inside it. Call `Reset` on a pooled object before `Put`. Prefer unbuffered channels unless a measured need justifies a buffer.
- In a hot `select` loop, reuse a `time.NewTimer` with `Reset` rather than calling `time.After` each pass.
- No fire-and-forget goroutines unless their lifecycle, shutdown, error handling, and backpressure are explicit.

## Dependencies

- Use existing project dependencies when they fit. Otherwise prefer the stdlib, for example `net/http` and `httptest`, `errors`, `log/slog`, `slices`/`maps`, and `testing`.
- Add a module only for a capability the stdlib and current dependencies lack, after checking maintenance, license, and version compatibility. Then run `go mod tidy`.
- Don't wrap a dependency just to anticipate replacing it.
- Commit `go.sum`. Track developer tools with `go get -tool` (Go 1.24+ `tool` directives) instead of a `tools.go` file.
- Update with `go get -u=patch ./...`, then `go mod tidy`, tests, and `go vet`. Run `govulncheck ./...` before a release.
- `replace` directives apply only in the main module, so they don't reach consumers. Use `retract` to withdraw a bad release of your own module. A module at v2 or above needs the `/vN` suffix in its path.
- Prefer a stdlib solution over a utility library for small helpers (`slices`, `maps`, `cmp`, `strings`).

## Dependency injection

Pass dependencies as constructor arguments and wire them in `main`. Don't use globals or `init` for services, and don't pass a container around.

| Size | Approach |
| --- | --- |
| Under about 10 services | Manual constructors in `main` |
| Large graph, compile-time checks wanted | `google/wire` (generates code; the repository is archived, so keep it only where the repo already uses it) |
| Large graph, runtime wiring accepted | `uber-go/dig` or `uber-go/fx` (an `fx` `OnStart` hook must not block) |

Point a new graph at manual wiring, or `dig`/`fx` if a framework is justified. Otherwise follow the repo's existing choice.

## Tests

- Keep `_test.go` next to the code. Prefer external `package x_test` tests through the public API, and use same-package tests only when unexported behavior must be reached.
- Inject time, randomness, I/O, and processes through narrow seams. Don't sleep or contact real services.
- Read [references/testing.md](references/testing.md) when adding or reviewing table tests, golden files, build-tagged integration tests, benchmarks, fuzz targets, or concurrent-code tests.
- Use stdlib `testing` unless the repo already uses testify.

## Performance

Use `efficient:golang-performance` for benchmarks, profiling, and optimization. Optimize only against a measured bottleneck.

## Validate

- `gofmt -l` (or the repo's `goimports`/`gofumpt`) on changed files, plus `go vet ./pkg/...`.
- The narrowest `go test` that proves the contract, then `go test ./...` when shared code or the public boundary changed.
- `go test -race` for any change touching goroutines or shared state. A race report is a defect, not a flake. The detector only covers exercised paths.
- Run `staticcheck` or `golangci-lint run` when the repo configures them, and follow its config. Suppress with `//nolint:<linter> // <reason>` only for a justified false positive, never for `gosec`, `bodyclose`, or `sqlclosecheck` to get a pass. See [references/lint.md](references/lint.md).
- Triage failures as a product defect, wrong expectation, race, hang or leak (`-timeout` plus the goroutine dump), toolchain/version mismatch, or missing prerequisite.

## References

Read these when the work matches.

- [references/pitfalls.md](references/pitfalls.md) when writing or reviewing code with interfaces returning errors, maps, slices, `defer` in loops, numeric conversions, timers, context keys, or receivers.
- [references/security.md](references/security.md) when code handles untrusted input, file paths, commands, templates, outbound requests, crypto, or passwords.
- [references/debugging.md](references/debugging.md) when a crash, hang, leak, slow path, or intermittent failure has no known cause.
- [references/database.md](references/database.md) when writing `database/sql`, `sqlx`, or `pgx` code.
- [references/grpc.md](references/grpc.md) when the code imports `google.golang.org/grpc`.
- [references/modernize.md](references/modernize.md) when modernizing code, bumping the `go` directive, or fixing a deprecation warning.
- [references/refactoring.md](references/refactoring.md) when renaming, moving, extracting, or inlining across packages.
- [references/lint.md](references/lint.md) when configuring golangci-lint or deciding whether to suppress a finding.
