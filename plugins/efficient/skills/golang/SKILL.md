---
name: golang
description: Idiomatic Go for package boundaries, errors, interfaces, context propagation, goroutine lifecycles, stdlib choices, tests, benchmarks, and profiling. Use when writing, reviewing, or debugging *.go files or go.mod modules, including race, leak, or cancellation bugs. Not for generic test strategy (efficient:testing) or CI configuration.
---

# Efficient Go

Keep the existing observable contract (API, error behavior, cancellation, concurrency guarantees) unless the request changes it.

## Orient

- Read `go.mod` (the `go` and `toolchain` lines), the changed package and its callers, nearby `_test.go` files, and any Makefile or Taskfile that defines supported commands.
- Don't use an API newer than the module's declared `go` version, even if the local toolchain has it. Examples include range-over-func (1.23), `min`/`max` builtins (1.21), and per-iteration loop variables (1.22).
- Find callers and implementations with `codegraph_explore` when `.codegraph/` exists. Otherwise use `go doc`, Grep, or the LSP tool (gopls) for references and implementers.
- For third-party module APIs, check docs with Context7 (`resolve-library-id`, then `query-docs`) or `go doc <pkg>.<Symbol>` against the version in `go.mod`.
- Reproduce with the narrowest command, such as `go test ./pkg/... -run 'TestName/subcase' -count=1`.

## Packages

- Keep code in the package that owns its behavior and data.
- `main` handles startup, config, wiring, and exit codes. Reusable behavior lives in ordinary packages.
- Use `internal/` only to enforce repository-private imports.
- Add a package, exported identifier, module, or `go.work` only when current callers need that boundary.
- Break import cycles by moving the shared type to the narrowest package that can own it, never to a catch-all `util` or `common`.

## APIs and interfaces

- Start with concrete types and functions. Accept interfaces and return structs.
- Define a small interface in the consuming package only when that consumer needs substitution, such as a real external dependency plus a test double. Include only the methods it calls.
- Make zero-value usability, constructors, and nil semantics explicit where callers can see them.
- Treat every exported identifier as a compatibility promise.

## Context

- Take `ctx context.Context` as the first parameter for request-, job-, or caller-scoped I/O, blocking work, or child work. Pass the received context through.
- Derive a child context only to add a deadline, a cancellation boundary, or a request-scoped value. Always `defer cancel()`.
- Never store a context in a struct, swap a supplied ctx for `context.Background()`, pass `nil`, or use context values as optional parameters.
- At the process root, use `context.Background()` or `signal.NotifyContext`, matching the app's lifecycle.

## Errors

- Return ordinary failures as `error`. Panic only for unrecoverable programmer or process invariants.
- Check every returned error, including from `Close` on writers where it matters.
- Wrap with `fmt.Errorf("op: %w", err)` only where the extra context helps locate the failing layer and callers may need `errors.Is`/`errors.As`. Use `%v` to deliberately hide the cause.
- Use sentinel errors (`var ErrX = errors.New(...)`) for conditions callers branch on, and typed errors when callers need fields. Use `errors.Join` only when several independent failures all matter.
- Handle an error once. At an application boundary, map it to a response or exit code and log it there, not at every layer.
- `recover` only at an intentional request, worker, or process boundary.

## Goroutines and channels

- Before writing `go`, name the goroutine's owner, input, result/error path, cancellation signal, and the event that proves it exited.
- Stay synchronous unless concurrency serves a stated latency, throughput, or isolation need.
- Bound fan-out and queue sizes from a real limit. `errgroup.WithContext` plus `SetLimit` covers most fan-out.
- Only the sender that owns a channel closes it.
- Every blocking send, receive, or timer wait needs a `select` on `ctx.Done()` or another exit path.
- Use the simplest synchronization that works. Keep locks out of blocking I/O, and wait for workers (`WaitGroup`, `errgroup.Wait`) before releasing what they depend on.
- No fire-and-forget goroutines unless their lifecycle, shutdown, error handling, and backpressure are explicit.

## Dependencies

- Use existing project dependencies when they fit. Otherwise prefer the stdlib, for example `net/http` and `httptest`, `errors`, `log/slog`, `slices`/`maps`, and `testing`.
- Add a module only for a capability the stdlib and current dependencies lack, after checking maintenance, license, and version compatibility. Then run `go mod tidy`.
- Don't wrap a dependency just to anticipate replacing it.

## Tests

- Keep `_test.go` next to the code. Prefer external `package x_test` tests through the public API, and use same-package tests only when unexported behavior must be reached.
- Inject time, randomness, I/O, and processes through narrow seams. Don't sleep or contact real services.
- Read [references/testing.md](references/testing.md) when adding or reviewing table tests, benchmarks, fuzz targets, or concurrent-code tests.

## Performance

- Optimize only against a measured bottleneck on a representative workload.
- Benchmark with `go test -bench=BenchmarkX -benchmem -count=10 ./pkg` and compare runs with `benchstat old.txt new.txt`.
- Profile with `-cpuprofile`/`-memprofile` and `go tool pprof`. For long-running services, use `net/http/pprof`.
- Change one factor at a time. Don't add pooling, `unsafe`, concurrency, or caching on intuition.

## Validate

- `gofmt -l` (or the repo's `goimports`/`gofumpt`) on changed files, plus `go vet ./pkg/...`.
- The narrowest `go test` that proves the contract, then `go test ./...` when shared code or the public boundary changed.
- `go test -race` for any change touching goroutines or shared state. A race report is a defect, not a flake. The detector only covers exercised paths.
- Run `staticcheck` or `golangci-lint run` when the repo configures them.
- Triage failures as a product defect, wrong expectation, race, hang or leak (`-timeout` plus the goroutine dump), toolchain/version mismatch, or missing prerequisite.
