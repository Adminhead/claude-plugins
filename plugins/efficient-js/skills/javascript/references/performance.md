# JavaScript performance

Read this before changing JavaScript for speed, memory, or responsiveness.

## Measure first

- Define the scenario, input size, runtime and version, and metric (elapsed time, latency distribution, memory growth, event-loop delay, or frame time).
- Take a baseline, change one suspected cost, and rerun the same scenario under comparable conditions.
- Record the command, environment, sample count, and result. A single noisy timing or a different workload proves nothing.
- If results are inconclusive, remove the speculative optimization and report the limit.

## Tools

| Runtime | CPU | Memory | Other |
| --- | --- | --- | --- |
| Node | `node --cpu-prof app.js` (open the `.cpuprofile` in Chrome DevTools) | `--heap-prof`, `--inspect` plus a heap snapshot | `perf_hooks.monitorEventLoopDelay()` for event-loop lag; `performance.now()` for spans |
| Bun | `bun --inspect` with the web debugger | Heap snapshots via `bun:jsc` | `Bun.nanoseconds()` |
| Deno | `deno run --inspect` with Chrome DevTools | Heap snapshot via the inspector | `deno bench` |
| Browser | DevTools Performance panel | Memory panel (heap snapshots, allocation timeline) | `PerformanceObserver` for long tasks; `performance.mark`/`measure` |

Use the repo's existing benchmark harness (for example `vitest bench`, `tinybench`, or `mitata`) when present. Don't add one for a narrow question.

## Typical wins, once measured

- A better algorithm or data structure, such as `Map`/`Set` instead of array scans.
- Hoisting invariant work out of hot loops, and batching I/O or DOM writes.
- Parallel awaits for independent I/O.
- Streaming large payloads instead of buffering them.
- Moving CPU-heavy work off the main thread or event loop (Web Workers, `worker_threads`) when it blocks responsiveness.
- Removing listener, timer, or closure retention behind memory growth.

Inspect the hot path before caching, batching, parallelizing, or replacing an algorithm.
