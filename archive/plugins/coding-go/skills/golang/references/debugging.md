# Go debugging

Read this when a Go program crashes, hangs, leaks, runs slowly, or fails intermittently and the cause isn't obvious. For the general method (reproduce, one hypothesis at a time), use `coding-core:problem-solving`. This file holds the Go-specific tools and traps.

## Symptom to first tool

| Symptom | First step |
| --- | --- |
| Won't compile | `go build ./... && go vet ./...`, read the first error only |
| Wrong output | Failing test with the smallest input, then check the errors, nil, and shadowing traps below |
| Panic | Read the top frame in your code. `GOTRACEBACK=all` shows every goroutine |
| Fails sometimes | `go test -race -count=20 ./pkg/...`, then check shared state and time |
| Hangs | Goroutine dump: `kill -QUIT <pid>`, `GET /debug/pprof/goroutine?debug=2`, or `go test -timeout 30s` |
| Goroutine count grows | Compare two `goroutine` profiles over time. On Go 1.27+ the `goroutineleak` profile (`pprof.Lookup("goroutineleak")` or `/debug/pprof/goroutineleak`) lists goroutines blocked on primitives no live goroutine can reach. Go 1.26 needs `GOEXPERIMENT=goroutineleakprofile` |
| High CPU or memory | CPU or heap profile with `go tool pprof` (read `flat` versus `cum`, and `alloc_space` versus `inuse_space`) |
| Latency spikes | CPU plus block and mutex profiles (`runtime.SetBlockProfileRate`, `SetMutexProfileFraction`), then `go tool trace` |

## Capture before restarting

A restart destroys the evidence. In production, first save the goroutine dump (`debug=2`), a heap profile, and a 30-second CPU profile from `net/http/pprof` on an internal port, plus the logs and the build version. Take a second heap profile minutes later for a leak so `pprof -base` can diff them.

## Common bugs

- **Shadowed `err`.** `x, err := f()` inside an inner block declares a new `err`, and the outer one stays nil. The `shadow` analyzer (enable it under `govet` in golangci-lint) finds it.
- **Missing `return` after `http.Error`.** The handler keeps running and may write twice or act on bad input.
- **`os.Exit` and `log.Fatal` skip defers.** Return an error to `main`, and exit there.
- **`recover` only works in the panicking goroutine's deferred function.** A panic in a spawned goroutine kills the process unless that goroutine recovers.
- **Copied sync types.** A struct holding a `sync.Mutex` copied by value gets an independent, unlocked mutex. Run `go vet`.
- **JSON numbers into `any` become `float64`.** IDs above 2^53 lose precision. Decode into typed fields, or use `Decoder.UseNumber`.
- **Unexported struct fields are skipped** by `encoding/json` without an error.
- **`for ... range` over a copied array or struct value** mutates the copy. Index the slice instead.
- **Leaked response bodies.** When `http.Client.Do` returns `err == nil`, `resp.Body` must be closed on every path. Read it to EOF first if the connection should be reused.
- **A goroutine blocked on a channel nobody reads** is a leak. Find the sender in the dump and the missing `ctx.Done()` case.

Also check `pitfalls.md` in this directory (typed nil, `append` aliasing, `defer` in loops, narrowing conversions).

## Delve

For stepping through logic, `dlv test ./pkg -- -test.run TestName` runs a single test under the debugger. Use it after printing and logging stop being enough, not before.
