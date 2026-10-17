---
name: python
description: Python idiom, review and diagnosis covering typing, exceptions, resource lifetimes, asyncio, retries and background jobs, profiling, and pytest. Use when writing, reviewing or debugging *.py code, or when ruff, mypy, pyright, pytest or uv settings in pyproject.toml shape the change.
---

# Python

Preserve the public contract (results, raised exceptions, ordering, side effects, import-time behavior, supported Python versions) unless the request changes it. Write direct, idiomatic code that the repository's configured formatter, linter, type checker, and test runner accept.

Not for building or releasing distributions (`python-packaging`) or FastAPI routes and dependencies (`fastapi`).

## Orient

- Read `pyproject.toml` (and `setup.cfg`, `tox.ini`, `noxfile.py`, `.python-version` when present). Note `requires-python`, the package manager (uv, poetry, pip-tools, hatch), and the configured ruff/black, mypy/pyright, and pytest settings.
- Run tools through the project's runner (`uv run`, `poetry run`, `hatch run`, or the active venv), never a global interpreter.
- Note where the code runs: CLI, web request, worker, subprocess, or event loop. That decides which lifetime and blocking rules apply.
- Don't use syntax or stdlib APIs newer than `requires-python` allows (for example `match`, `except*`, `TaskGroup`, PEP 695 generics).
- Find callers before changing an exception type, return shape, or import-time effect. Use the codebase-memory tools (`search_graph`, `trace_path`) when the project is indexed; otherwise Grep. The LSP tool, when configured, gives references and inferred types.
- For version-sensitive third-party APIs, check current docs with Context7 (`resolve-library-id`, then `query-docs`) against the installed version (`uv pip show <pkg>` or the lockfile).

## Design

- Prefer the standard library when it fully covers the need at the supported versions.
- Reach for a function, dataclass, or small class with one job before a protocol, registry, base class, or helper layer.
- Keep import-time work minimal and deterministic. Put I/O, environment reads, and client construction at an explicit entry point or an injected boundary.
- Keep business logic free of I/O: pass it the data it decides on, and let the caller fetch and persist.
- Name things so units, ownership, and failure meaning are visible. Follow local naming and import conventions.
- Never use mutable default arguments. Don't hand out internal mutable collections; return a copy or an immutable view when ownership matters.

## Types

- Type public functions, return values, and stateful data wherever the project uses typing or the boundary is non-obvious.
- Accept abstract collection types (`Iterable`, `Mapping`, `Sequence`) only when callers need alternatives; return concrete types.
- Model absence with `X | None` and distinct valid states with a small value type or enum, not flag combinations.
- Annotations don't validate at runtime. Parse untrusted input at the boundary and keep errors actionable there.
- Use unions, `Protocol`, generics, `@overload`, or `TypeGuard`/`TypeIs` only when they clarify a real caller contract. Read [references/typing.md](references/typing.md) before adding generics, protocols, callable types, or tightening mypy/pyright strictness.
- Don't hide uncertainty behind `Any`, untyped `dict`, blanket `cast`, or file-wide ignores. A necessary suppression stays on one line with the specific error code (`# type: ignore[attr-defined]`, `# pyright: ignore[reportX]`) and a reason.

## Exceptions and resources

- Raise or translate exceptions only where you can add domain context. Chain with `raise NewError(...) from err` so the cause survives.
- Don't catch `Exception` to log and continue or to return a sentinel. Return expected outcomes as values only when the local API already does.
- Use `with` / `async with` for files, locks, sessions, responses, temp dirs, and any acquire/release pair. `contextlib.ExitStack` / `AsyncExitStack` handle a variable number of them.
- Make ownership explicit. A function either closes what it opens, documents that the caller takes ownership, or returns a context manager.
- An `__exit__` returns a true value only to suppress one named, expected exception. Return `False` (or `None`) otherwise.
- Close generators and streams when you stop early. Don't rely on garbage collection for prompt cleanup.
- Let `KeyboardInterrupt`, `SystemExit`, and `asyncio.CancelledError` propagate after bounded cleanup. `except Exception` doesn't catch them, and it shouldn't be widened to `BaseException` without re-raising.

## Sync and async

- Stay synchronous unless concurrent waiting or an async caller contract requires otherwise. Making a function `async` commits every caller to it.
- Never block the event loop with sync I/O or long CPU work. Offload through `asyncio.to_thread`, an executor, or the project's established mechanism, and define its timeout and cancellation behavior.
- Give every task an owner that awaits it. Prefer `asyncio.TaskGroup` (3.11+) or the project's structured equivalent. Keep a reference to any bare `create_task` result, since the loop holds only a weak one.
- Use `asyncio.timeout()` (3.11+) or `wait_for` for deadlines. On timeout, cancellation, or partial startup, release everything acquired and surface the primary failure, not cleanup noise.
- Don't pass loop-bound objects (clients, locks, queues) across threads, processes, or loops. `contextvars` doesn't flow into threads unless you copy the context.
- Before writing fan-out, rate limiting, producer/consumer queues, or sync-async bridges, read [references/async.md](references/async.md).

## Packaging touchpoints

- Keep importable code in the established layout. Don't mutate `sys.path` or rely on the current directory.
- Change dependencies, extras, or lockfiles only when the behavior requires it, and only through the project's resolver (`uv add`, `uv lock`, `poetry add`). Never hand-edit a lockfile.
- For build config, package data, entry points, or wheel/sdist work, switch to `python-packaging`. Before adding an unfamiliar dependency, use `dependency-vetting` if installed.

## Validate

- Run the narrowest configured checks that reach the change, for example `uv run ruff check <paths>`, `uv run ruff format --check <paths>`, `uv run mypy <pkg>` or `uv run pyright <paths>`, and `uv run pytest <path>::<test> -x`.
- For ruff findings, run `ruff check --fix` (safe fixes), then `ruff format`. Apply `--unsafe-fixes` only after reading `ruff check --diff --unsafe-fixes`, because an unsafe fix can change behavior (an exception type, a comment). Re-run until nothing changes. Suppress with `# noqa: <code>` and a reason, not a bare `# noqa`, and ask the user when a finding has more than one reasonable fix.
- Exercise what the type checker can't prove, such as the raised exception, resource closure, import behavior, and task completion or cancellation.
- `python -X dev` (or `-W error::ResourceWarning`) surfaces unclosed resources. `PYTHONASYNCIODEBUG=1` reports slow callbacks and never-awaited coroutines.
- When the repo uses pytest, read [references/pytest.md](references/pytest.md) before adding or changing tests.
- Use `unit-testing` if installed to choose which regression tests to add.

## Reviewing Python code

When asked to review Python, or before finalizing a non-trivial change, walk [references/review-checklist.md](references/review-checklist.md). Report findings with file:line and the concrete failure each one causes.

## Reliability and observability

- Before adding retries, timeouts, batch handling, fallbacks, or a queue worker, read [references/reliability.md](references/reliability.md).
- Before adding structured logging, correlation IDs, or metrics, read [references/observability.md](references/observability.md).

## Performance

Before changing code for speed or memory, read [references/performance.md](references/performance.md).

## Failure triage

| Signal | Look first at | Avoid |
| --- | --- | --- |
| Type error | Runtime contract; narrow at the boundary, then fix the annotation or code | `cast`, `Any`, or a broad ignore |
| `ResourceWarning` or pending-task warning | The owner and exit path of the resource or task | Sleeps, finalizers, test-order luck |
| `RuntimeWarning: coroutine ... was never awaited` | The call site missing `await` or a task owner | Wrapping it in `asyncio.run` inside a running loop |
| Async hang or lost cancellation | A minimized task graph; awaits, timeouts, shutdown | Retries or swallowing `CancelledError` |
| Works in checkout, fails installed | The built artifact (see `python-packaging`) | Patching `sys.path` |

Parts of the review checklist, typing, async and reliability references are adapted from wshobson/agents (python-development skills), MIT License; see `LICENSE`.
