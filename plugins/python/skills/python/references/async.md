# Asyncio patterns and pitfalls

Read this before writing concurrent fan-out, rate limiting, a producer/consumer queue, or a bridge between sync and async code. Use the project's async framework (asyncio, anyio, trio) and its conventions; the examples use asyncio.

Partly adapted from wshobson/agents `async-python-patterns` (MIT License).

## Pitfalls

| Pitfall | Symptom | Fix |
| --- | --- | --- |
| Calling a coroutine without `await` | `RuntimeWarning: coroutine ... was never awaited`; the work never runs | `await` it, or hand it to a task owner |
| `time.sleep`, `requests`, sync DB driver in `async def` | Every other request stalls; `PYTHONASYNCIODEBUG=1` reports slow callbacks | Async library, or `await asyncio.to_thread(fn, ...)` |
| `asyncio.run()` inside a running loop | `RuntimeError: asyncio.run() cannot be called from a running event loop` | `await` the coroutine; from a worker thread use `asyncio.run_coroutine_threadsafe(coro, loop)` |
| Fire-and-forget `create_task` | Task garbage-collected mid-run, or its exception logged only at shutdown | `TaskGroup`, or keep a reference and await or cancel it |
| Swallowing `CancelledError` | Shutdown hangs; timeouts stop working | Clean up, then re-raise |
| `gather` over an unbounded list | Connection pool exhausted, rate limits hit, memory spike | Semaphore or fixed worker pool |
| `gather` without `return_exceptions` | First failure propagates, the rest keep running unobserved | `TaskGroup` (cancels siblings) or `return_exceptions=True` and inspect each result |
| Sharing a client or lock across loops or threads | `attached to a different loop` errors, hangs | Create loop-bound objects inside the loop that uses them |
| Holding an `asyncio.Lock` across a slow await | Serialized throughput | Keep the critical section to the shared-state mutation |

## Structured fan-out

```python
async def fetch_all(urls: list[str], limit: int = 10) -> list[Response]:
    sem = asyncio.Semaphore(limit)

    async def one(url: str) -> Response:
        async with sem:
            return await client.get(url, timeout=10)

    async with asyncio.TaskGroup() as tg:  # 3.11+
        tasks = [tg.create_task(one(u)) for u in urls]
    return [t.result() for t in tasks]
```

- `TaskGroup` cancels the remaining tasks when one fails and raises an `ExceptionGroup`. Handle it with `except*` (3.11+) when callers need per-type handling.
- When partial results are acceptable, use `gather(..., return_exceptions=True)` and split results into successes and failures, as for batches in [reliability.md](reliability.md).
- `asyncio.as_completed` processes results as they finish; pair it with the same semaphore.

## Producer/consumer

```python
async def run(items: AsyncIterator[Item], workers: int = 4) -> None:
    queue: asyncio.Queue[Item] = asyncio.Queue(maxsize=100)  # bounded = backpressure

    async def worker() -> None:
        while True:
            item = await queue.get()
            try:
                await process(item)
            finally:
                queue.task_done()

    async with asyncio.TaskGroup() as tg:
        tasks = [tg.create_task(worker()) for _ in range(workers)]
        async for item in items:
            await queue.put(item)
        await queue.join()
        for t in tasks:
            t.cancel()
```

- Bound the queue so a fast producer can't exhaust memory.
- Decide what a failing `process` does: retry, record the failure, or stop the run. The `finally: task_done()` keeps `join()` from hanging either way.
- Python 3.13 adds `Queue.shutdown()` as an alternative to cancelling workers.

## Sync and async bridges

- Sync code calling async: `asyncio.run(main())` once at the entry point. Don't sprinkle `asyncio.run` through library code.
- Async code calling blocking sync code: `await asyncio.to_thread(fn, *args)`. It uses the default executor, which is shared and bounded; give a large or long-running workload its own `ThreadPoolExecutor` via `loop.run_in_executor`.
- CPU-bound work: a `ProcessPoolExecutor`, not threads, unless the interpreter is a free-threaded build.
- Keep a call path fully sync or fully async. Mixed paths hide blocking calls and double the APIs to maintain.

## Async resources

- Use `async with` for clients, sessions, and pools, and create them once per app or worker lifespan.
- `contextlib.asynccontextmanager` writes a small async context manager; put cleanup after `yield` in a `try`/`finally`.
- Close abandoned async generators with `contextlib.aclosing(gen)`; otherwise their `finally` blocks run at an unpredictable time or not at all.

## Testing

- Use the repo's async test support (`pytest-asyncio`, `anyio`) and its configured mode; see [pytest.md](pytest.md).
- Test timeout and cancellation paths: cancel the task under test and assert cleanup ran and `CancelledError` propagated.
- `asyncio.wait_for(..., timeout=...)` around the code under test keeps a hang from stalling the suite.
