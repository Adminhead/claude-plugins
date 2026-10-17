# GC and runtime tuning

Read this when GC takes a large share of CPU, memory use must fit a limit, or a containerized service is OOM-killed. Reduce allocations first (see `patterns.md`), because tuning the collector only changes how much it costs.

## Diagnose

- `GODEBUG=gctrace=1 ./app` prints one line per GC cycle with heap sizes and CPU share.
- A CPU profile with `runtime.gcBgMarkWorker`, `mallocgc`, or `scanobject` near the top, or a trace showing long assists, confirms GC cost.
- `runtime/metrics` (and `runtime.ReadMemStats`) give heap and GC numbers in-process for a monitoring system.

## GOGC

The next collection starts when the heap reaches `live heap + (live heap + GC roots) * GOGC / 100`. Per the Go GC guide, doubling GOGC roughly doubles heap overhead and halves GC CPU cost. The default is 100. Raise it when memory is spare and GC CPU is high. Lower it when memory is tight. `GOGC=off` is for experiments.

## GOMEMLIMIT

`GOMEMLIMIT` (or `debug.SetMemoryLimit`, Go 1.19+) is a soft limit on the Go runtime's total memory. The runtime collects more often as it approaches the limit. Notes from the Go GC guide:

- Use it when the process owns its memory, as in a container with a memory limit. Leave 5 to 10% headroom for memory the runtime doesn't track, such as cgo and non-Go mappings.
- Don't set it in programs that run in environments you don't control, such as command-line tools. Users can set it themselves.
- A limit set too low causes thrashing, where the GC runs constantly. The runtime caps GC CPU at about 50% to stop a total stall, and then the process can exceed the limit anyway. When a process is already near its memory limit, raise the limit or lower GOGC first.
- A reasonable setup is `GOGC=100` with `GOMEMLIMIT` just under the container limit. It handles transient spikes while GOGC governs steady state.

Don't use a ballast allocation. `GOMEMLIMIT` replaced it.

## GOMAXPROCS in containers

Since Go 1.25, on Linux the runtime defaults `GOMAXPROCS` to the cgroup CPU bandwidth limit when it is below the logical CPU count, and updates it when limits change. It ignores Kubernetes CPU requests. Setting `GOMAXPROCS` yourself, or `GODEBUG=containermaxprocs=0` or `updatemaxprocs=0`, turns this off. With an older toolchain, set `GOMAXPROCS` explicitly or use `go.uber.org/automaxprocs`. Verify the value with `runtime.GOMAXPROCS(0)` at startup when CPU is throttled.

## Toolchain notes

Release notes change allocator and compiler behavior. Go 1.27 adds size-specialized allocation routines for small objects, which can shift allocation-heavy benchmark baselines. Rebuild the "before" benchmark on the same toolchain as the "after".
