# Go testing

Read this when adding or reviewing Go tests, benchmarks, fuzz targets, or concurrent-code validation. The package's existing commands and declared Go version win.

## Table tests

- Use a table of named cases with `t.Run(tc.name, ...)` when every case exercises the same operation and assertions. Don't force unrelated scenarios into one table.
- Parallel subtests (`t.Parallel()`) need isolated fixtures. Modules declaring `go` below 1.22 reuse the loop variable, so they need `tc := tc` before the closure.
- Compare structs with `reflect.DeepEqual` or the repo's existing `go-cmp` (`cmp.Diff`). Report got versus want clearly.
- Stdlib `testing` comes first. Use testify only where the repo already depends on it, and then follow its conventions: `require` for preconditions whose failure makes the rest meaningless, `assert` otherwise, `Eventually` instead of sleeps, and `testifylint` if the repo lints with it. Don't add testify to a repo that lacks it.

## Helpers and cleanup

- Mark helpers with `t.Helper()`.
- Register release with `t.Cleanup` / `b.Cleanup` right where the resource is acquired. Use `t.TempDir()` for files and `t.Setenv` for env vars (it can't combine with `t.Parallel`).
- Use `httptest.NewServer` or `httptest.NewRecorder` for HTTP. Let the runner own teardown instead of process exit or sleeps.

## Test layout

- Gate slow tests that need a database, network, or containers with a build tag (`//go:build integration`, run with `go test -tags integration ./...`) rather than `-short`, so the default `go test ./...` stays fast and hermetic.
- Golden files: store expected output under `testdata/`, and add an `-update` flag (`var update = flag.Bool("update", false, "rewrite golden files")`) that rewrites them. Review the resulting diff like code.
- Add `ExampleXxx` functions with an `// Output:` comment for public APIs. They run as tests and appear in `go doc`.
- Inject a clock (a `func() time.Time` or a small interface) instead of calling `time.Now` in code under test. On Go 1.25+, `testing/synctest` can replace the injection for concurrent code.

## Benchmarks

- Benchmark only a requested or measured performance question.
- For benchmark statistics, profiling, and optimization, use the `golang-performance` skill.
- Keep setup outside the timed loop, or call `b.ResetTimer()` after it. On Go 1.24+, `for b.Loop()` handles this and keeps results alive.
- Otherwise assign results to a package-level sink so the compiler can't discard the work.
- Use `b.Run` for materially different workloads. Add `-benchmem` when allocations matter, and compare with `benchstat` across `-count=10` runs.

## Fuzzing

- Fuzz only an invariant that holds across broad input, such as no panic, round trips, bounds preservation, or agreement with a reference implementation.
- Seed with `f.Add` using ordinary edge cases. Return early for inputs outside the invariant's domain.
- Keep minimized failures in `testdata/fuzz/` as regression inputs.
- Run with `go test -fuzz=FuzzX -fuzztime=30s ./pkg`.

## Concurrency

- Run affected packages with `go test -race`. Choose the narrowest package pattern that covers the change, then widen when shared code requires it.
- Investigate a race report as a defect instead of rerunning it away. The detector only proves the paths it exercised.
- For hangs, set `-timeout`. The panic dump shows every goroutine stack.
- To catch leaked goroutines, add `goleak.VerifyTestMain(m)` in `TestMain`, or `defer goleak.VerifyNone(t)` in one test, if the repo already uses `go.uber.org/goleak`. Adding the module is a dependency decision (see Dependencies in `SKILL.md`).
- Coordinate with channels or `sync` primitives, never `time.Sleep`. On Go 1.25+, `testing/synctest` gives deterministic fake time for concurrent code.
