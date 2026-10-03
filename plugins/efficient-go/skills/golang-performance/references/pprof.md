# Reading profiles and traces

Read this when you need to capture a Go profile, interpret `go tool pprof` output, or choose between a profile and an execution trace.

## Capture

- From a benchmark, with no server: `go test -run='^$' -bench=BenchmarkX -cpuprofile=cpu.prof -memprofile=mem.prof -trace=trace.out ./pkg`. Add `-blockprofile` or `-mutexprofile` for contention.
- From a running service, import `_ "net/http/pprof"` and serve it on a localhost or otherwise private listener, never a public one, because the handlers expose internals. Then run `go tool pprof 'http://localhost:6060/debug/pprof/profile?seconds=30'`. Handlers accept GET only.
- From code, use `runtime/pprof` (`StartCPUProfile`, `Lookup("allocs").WriteTo`).

Use one diagnostic at a time. The Go docs warn that tools interfere (precise memory profiling skews CPU profiles, and block profiling affects scheduler traces), so capture each profile in its own run.

## Profile types

| Profile | Answers | Notes |
| --- | --- | --- |
| cpu | Which functions use CPU time | Samples on-CPU time only, so I/O waits and sleeps are invisible |
| heap `-alloc_objects` | Where allocations happen, by count | Best first look for GC churn |
| heap `-alloc_space` | Where bytes are allocated | Cumulative since start, including freed memory |
| heap `-inuse_space` / `-inuse_objects` | What is live now | Use for leaks. Compare two snapshots with `-base` |
| goroutine | Where goroutines are parked | Many stacks at one call site means a leak or pileup |
| block | Time blocked on channels, mutexes, timers | Off by default: `runtime.SetBlockProfileRate(rate)`; rate 1 records every event, and a higher value samples about one event per `rate` ns blocked |
| mutex | Lock contention | Off by default: `runtime.SetMutexProfileFraction(rate)`; on average 1 in `rate` events is reported, 0 turns it off |
| threadcreate | Where OS threads are created | Rarely needed |

Heap profiles sample allocations (`runtime.MemProfileRate`), so small counts are estimates.

## Read it

Start with `go tool pprof -http=:8080 cpu.prof` for a graph and flame view, or the text commands below.

```sh
go tool pprof -top -nodecount=15 cpu.prof              # flat time by function
go tool pprof -top -cum cpu.prof                       # cumulative time
go tool pprof -sample_index=alloc_objects -top mem.prof # allocation count
go tool pprof -list 'Parse$' cpu.prof                  # per-line costs
go tool pprof -peek 'Parse$' cpu.prof                  # callers and callees
```

- **Flat** is time spent in the function's own code. **Cum** also counts everything it called.
- High flat and high cum: the function itself is the cost. Change its algorithm or data layout.
- Low flat and high cum: a coordinator. Descend into its callees with `-peek` or `-list`.
- `runtime.mallocgc` high in the CPU profile: allocation rate is the problem. Switch to the `alloc_objects` profile and find the callers.
- `runtime.scanobject` high: the GC is scanning many pointers. Fewer pointers (values in slices, flatter structs) helps.
- `runtime.memmove` high: large copies, often slice growth without preallocation.
- `alloc_objects` high with `inuse_space` low: short-lived garbage. `inuse_space` rising over time: a leak.

To find a leak, take two heap profiles a few minutes apart and run `go tool pprof -sample_index=inuse_space -diff_base=first.prof second.prof`. `-base` subtracts instead of diffing. Profiles carry function names, so `-top`, `-list`, and `-peek` work on the `.prof` file alone. Pass the binary (for `go test`, the `pkg.test` it leaves behind) as the first argument only for `-disasm` and `weblist`.

## Wall-clock time that the CPU profile misses

When latency is high and CPU is low, the time is off-CPU. Options, cheapest first:

1. Goroutine, block, and mutex profiles show where goroutines wait.
2. `github.com/felixge/fgprof` samples all goroutines at about 99 Hz and shows on-CPU and off-CPU time together. Mount it with `http.DefaultServeMux.Handle("/debug/fgprof", fgprof.Handler())`. Its overhead grows with the number of goroutines, so be careful beyond a few thousand.
3. The execution trace.

## Execution trace

`go test -trace=trace.out` or `curl -o trace.out 'http://localhost:6060/debug/pprof/trace?seconds=5'`, then `go tool trace trace.out`. Use it for questions pprof can't answer: scheduling latency, GC phases and assists, why goroutines wait, and the wall-clock timeline of a request (add `runtime/trace` tasks and regions to label it). `go tool trace -pprof=sync|net|syscall|sched trace.out` converts blocking time to a pprof profile.

| Question | Tool |
| --- | --- |
| Where does CPU go | pprof cpu |
| Where are allocations | pprof heap |
| Why is latency high with CPU low | trace, block profile, fgprof |
| Why are GC pauses or assists long | trace plus `GODEBUG=gctrace=1` |
| Which lock is contended | mutex profile, then trace for the timeline |

Since Go 1.25, `runtime/trace.FlightRecorder` keeps a moving window of the trace in memory. Call `WriteTo` when something goes wrong (a slow request, an error) to save only the last few seconds. Only one flight recorder can be active at a time. Configure the window with `FlightRecorderConfig` (`MinAge`, `MaxBytes`).
