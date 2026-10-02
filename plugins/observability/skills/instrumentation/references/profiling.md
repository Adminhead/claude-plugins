# Profiling

Profiles show which code spends CPU time or holds memory, which metrics and traces cannot.

## On demand

- Go: import `net/http/pprof` on a separate, internal-only listener. Profiles expose internals, so never serve them on the public port; put them behind auth or a private network. Collect with `go tool pprof http://<host>:<port>/debug/pprof/profile?seconds=30` (CPU) and `/debug/pprof/heap` (memory). Goroutine, mutex, and block profiles cover leaks and contention (mutex and block profiles need their sampling rates enabled).
- Python: `py-spy record` attaches to a running process without code changes. `tracemalloc` covers memory.
- Node: `node --cpu-prof` or the inspector.

Gate the endpoints with an environment variable so they can be switched on in production without a redeploy.

## Continuous

A continuous profiler (Pyroscope, Parca, or a vendor agent) samples all the time at low overhead and lets you compare before and after a deploy. Adopt one when regressions keep arriving as incident surprises. Check the overhead on a canary first.

Profile after a metric or trace has pointed at a slow component. Profiling blind produces noise.
