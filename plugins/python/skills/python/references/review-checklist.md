# Python review checklist

Read this when reviewing Python code or before finalizing a non-trivial change. Walk each section that applies to the diff. A finding names the file and line, the failure it causes (lost error, leaked connection, stalled loop, duplicate side effect), and the fix. Skip items the repo's linters already enforce; check the ruff and type checker config first.

Adapted from wshobson/agents `python-anti-patterns` and related python-development skills (MIT License).

## Errors

- [ ] No `except Exception: pass`, and no broad catch that logs and continues or returns a sentinel such as `None`. Each handler catches the specific exceptions it can act on.
- [ ] Translated exceptions chain the cause (`raise DomainError(...) from err`).
- [ ] `KeyboardInterrupt`, `SystemExit` and `asyncio.CancelledError` are not swallowed. Any `except BaseException` re-raises.
- [ ] Input is validated at the boundary (request, CLI argument, file, message), not deep in the call stack where the error is unreadable.
- [ ] Batch code either stops on the first error by design or returns per-item successes and failures. It never drops failed items silently.
- [ ] Error messages and logged fields carry no secrets, tokens or raw user data. `str(exc)` from a third-party call can carry both.

## Resources

- [ ] Every acquire/release pair (file, socket, lock, DB session, HTTP response, temp dir, subprocess) uses `with` / `async with` or a `try`/`finally` that runs on every path.
- [ ] A variable number of resources uses `ExitStack` / `AsyncExitStack`, not a list closed in a loop that stops at the first failure.
- [ ] Ownership is clear: the function closes what it opens, or the name and docstring say the caller owns the result.
- [ ] Custom `__exit__` returns true only to suppress one named, expected exception (`BrokenPipeError` on a closed client, for example).
- [ ] Generators and streams that may be abandoned early are closed, or wrapped in `contextlib.closing` / `aclosing`.
- [ ] Clients and pools are created once per process or app lifespan and reused, not per call.

## Async

- [ ] Every coroutine call is awaited, or scheduled as a task that something awaits.
- [ ] No blocking call inside `async def`: `time.sleep`, `requests`, sync DB drivers, file-heavy work, CPU loops. Each is replaced by an async library or `asyncio.to_thread`.
- [ ] Every created task has an owner (`TaskGroup`, a kept reference that is awaited or cancelled on shutdown).
- [ ] Unbounded fan-out (`gather` over thousands of items) is bounded with a semaphore or worker pool.
- [ ] Cancellation cleanup is bounded and re-raises `CancelledError`.
- [ ] No `asyncio.run` called from code that may already run inside a loop.

## Infrastructure calls

- [ ] Every network call has a timeout derived from the caller's deadline.
- [ ] Retry logic lives in one decorator or client wrapper, not repeated per call site.
- [ ] Only one layer retries. A client library, proxy or queue that already retries isn't wrapped in a second loop.
- [ ] Retries cover only transient errors (connection errors, timeouts, 429, 502/503/504) and are bounded by attempts and total time, with jitter.
- [ ] A retried non-idempotent call (POST that creates, a charge, an email) carries an idempotency key.
- [ ] Queue tasks are idempotent under at-least-once delivery.

## Configuration and secrets

- [ ] No hard-coded hosts, credentials, tokens or environment-specific paths. Config comes from the environment or a typed settings object read at the entry point.
- [ ] Settings are read once at startup and passed in, not looked up with `os.environ[...]` deep in business code.
- [ ] Defaults are safe for production (debug off, verification on).

## Architecture

- [ ] Internal types (ORM models, protobufs, third-party response objects) don't cross the public boundary. The API returns its own response model or dataclass.
- [ ] Business rules take plain data and return plain data. SQL, HTTP and file access sit at the edges, so the rules test without mocks.
- [ ] Import-time code does no I/O, network, or environment-dependent work.
- [ ] No mutable default arguments, and no module-level mutable state shared across requests or threads without a lock.

## Types

- [ ] Public functions and methods are annotated, including return types.
- [ ] Collections have type parameters (`list[User]`, not `list`).
- [ ] No unexplained `Any`, blanket `cast`, or file-wide `# type: ignore`. Each suppression names the error code and says why.
- [ ] `X | None` returns are narrowed before use.

## Tests

- [ ] Error paths and edge cases are tested, not only the happy path: invalid input, conflict, timeout, empty and maximum sizes.
- [ ] Mocks sit at boundaries the code doesn't own (network, clock, filesystem, third-party APIs), use `autospec=True`, and patch the name where it is looked up.
- [ ] Async mocks are asserted as awaited (`assert_awaited_once`), not just called.
- [ ] Tests don't depend on order, wall-clock time, or network access unless marked as integration tests.

## Quick fixes

| Anti-pattern | Fix |
| --- | --- |
| Retry and timeout code repeated per call | One decorator or client wrapper |
| Hard-coded config | Environment variables read into a typed settings object |
| ORM model returned from an endpoint | Response model or DTO |
| SQL inside a business rule | Fetch at the edge, pass data in |
| `except Exception: pass` | Catch the specific exception; handle or re-raise |
| Batch aborts on one bad item, or loses it | Return `succeeded` and `failed` maps |
| `open()` without `with` | Context manager |
| `requests` or `time.sleep` in `async def` | `httpx.AsyncClient`, `asyncio.sleep`, or `asyncio.to_thread` |
| Untyped public function | Annotate parameters and return |
| Only happy-path tests | Add error, edge and boundary cases |
