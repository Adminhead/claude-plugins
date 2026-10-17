# Python performance

Read this before changing Python code for speed or memory.

## Measure first

- Define the workload, input size and distribution, environment, and metric (wall time, CPU time, peak memory, allocation growth, or I/O latency). Keep these separate, because a fix for one can hurt another.
- Take a baseline, change one suspected cause, and rerun the same workload.
- Keep a change only when the gain repeats clearly above noise and justifies the added complexity.
- Don't turn a one-off local timing into a permanent test threshold.

## Tools

Use the standard library first. Reach for a third-party profiler only when the repo already has one or its extra detail matters.

| Question | Tool |
| --- | --- |
| Micro-benchmark a small expression | `python -m timeit -s 'setup' 'stmt'` |
| Where does CPU time go? | `python -m cProfile -o out.prof script.py`, then `python -m pstats out.prof` (`sort cumtime`, `stats 20`) |
| What allocates, and does it grow? | `tracemalloc.start()`, then compare `take_snapshot()` results with `compare_to(..., "lineno")` |
| Peak memory of a process | `resource.getrusage(resource.RUSAGE_SELF).ru_maxrss` (Unix) |
| Live or sampling profile without code changes | `py-spy record` / `py-spy dump`, if installed |
| Event-loop stalls | `PYTHONASYNCIODEBUG=1` plus `loop.slow_callback_duration` |

## Typical wins, once measured

- A better algorithm or data structure, such as `set`/`dict` lookups instead of list scans, or `collections.deque` for queues.
- Moving invariant work out of loops, and batching I/O.
- Generators or streaming for large data instead of materialized lists.
- `functools.cache`/`lru_cache` only for pure functions with bounded key space.
- Concurrency only for measured wait time. Use threads or `asyncio` for I/O; use processes or native code for CPU-bound work, since the GIL applies unless the build is free-threaded.
