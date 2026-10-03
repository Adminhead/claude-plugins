---
name: python
description: Python idiom and diagnosis for typing, exceptions, resource lifetimes, asyncio, stdlib choices, profiling, and pytest. Use when writing, reviewing, or debugging *.py code, or when pyproject.toml tooling (ruff, mypy, pyright, pytest, uv) shapes the change. Not for building or releasing distributions (efficient:python-packaging) or FastAPI routes and dependencies (efficient:fastapi).
---

# Efficient Python

Preserve the public contract (results, raised exceptions, ordering, side effects, import-time behavior, supported Python versions) unless the request changes it. Write direct, idiomatic code that the repository's configured formatter, linter, type checker, and test runner accept.

## Orient

- Read `pyproject.toml` (and `setup.cfg`, `tox.ini`, `noxfile.py`, `.python-version` when present). Note `requires-python`, the package manager (uv, poetry, pip-tools, hatch), and the configured ruff/black, mypy/pyright, and pytest settings.
- Run tools through the project's runner (`uv run`, `poetry run`, `hatch run`, or the active venv), never a global interpreter.
- Note where the code runs: CLI, web request, worker, subprocess, or event loop. That decides which lifetime and blocking rules apply.
- Don't use syntax or stdlib APIs newer than `requires-python` allows (for example `match`, `except*`, `TaskGroup`, PEP 695 generics).
- Find callers before changing an exception type, return shape, or import-time effect. Use `codegraph_explore` when `.codegraph/` exists; otherwise Grep. The LSP tool, when configured, gives references and inferred types.
- For version-sensitive third-party APIs, check current docs with Context7 (`resolve-library-id`, then `query-docs`) against the installed version (`uv pip show <pkg>` or the lockfile).

## Design

- Prefer the standard library when it fully covers the need at the supported versions.
- Reach for a function, dataclass, or small class with one job before a protocol, registry, base class, or helper layer.
- Keep import-time work minimal and deterministic. Put I/O, environment reads, and client construction at an explicit entry point or an injected boundary.
- Name things so units, ownership, and failure meaning are visible. Follow local naming and import conventions.
- Never use mutable default arguments. Don't hand out internal mutable collections; return a copy or an immutable view when ownership matters.

## Types

- Type public functions, return values, and stateful data wherever the project uses typing or the boundary is non-obvious.
- Accept abstract collection types (`Iterable`, `Mapping`, `Sequence`) only when callers need alternatives; return concrete types.
- Model absence with `X | None` and distinct valid states with a small value type or enum, not flag combinations.
- Annotations don't validate at runtime. Parse untrusted input at the boundary and keep errors actionable there.
- Use unions, `Protocol`, generics, `@overload`, or `TypeGuard`/`TypeIs` only when they clarify a real caller contract.
- Don't hide uncertainty behind `Any`, untyped `dict`, blanket `cast`, or file-wide ignores. A necessary suppression stays on one line with the specific error code (`# type: ignore[attr-defined]`, `# pyright: ignore[reportX]`) and a reason.

## Exceptions and resources

- Raise or translate exceptions only where you can add domain context. Chain with `raise NewError(...) from err` so the cause survives.
- Don't catch `Exception` to log and continue or to return a sentinel. Return expected outcomes as values only when the local API already does.
- Use `with` / `async with` for files, locks, sessions, responses, temp dirs, and any acquire/release pair. `contextlib.ExitStack` handles a variable number of them.
- Make ownership explicit. A function either closes what it opens, documents that the caller takes ownership, or returns a context manager.
- Close generators and streams when you stop early. Don't rely on garbage collection for prompt cleanup.
- Let `KeyboardInterrupt`, `SystemExit`, and `asyncio.CancelledError` propagate after bounded cleanup. `except Exception` doesn't catch them, and it shouldn't be widened to `BaseException` without re-raising.

## Sync and async

- Stay synchronous unless concurrent waiting or an async caller contract requires otherwise. Making a function `async` commits every caller to it.
- Never block the event loop with sync I/O or long CPU work. Offload through `asyncio.to_thread`, an executor, or the project's established mechanism, and define its timeout and cancellation behavior.
- Give every task an owner that awaits it. Prefer `asyncio.TaskGroup` (3.11+) or the project's structured equivalent. Keep a reference to any bare `create_task` result, since the loop holds only a weak one.
- Use `asyncio.timeout()` (3.11+) or `wait_for` for deadlines. On timeout, cancellation, or partial startup, release everything acquired and surface the primary failure, not cleanup noise.
- Don't pass loop-bound objects (clients, locks, queues) across threads, processes, or loops. `contextvars` doesn't flow into threads unless you copy the context.

## Packaging touchpoints

- Keep importable code in the established layout. Don't mutate `sys.path` or rely on the current directory.
- Change dependencies, extras, or lockfiles only when the behavior requires it, and only through the project's resolver (`uv add`, `uv lock`, `poetry add`). Never hand-edit a lockfile.
- For build config, package data, entry points, or wheel/sdist work, switch to `efficient:python-packaging`.

## Validate

- Run the narrowest configured checks that reach the change, for example `uv run ruff check <paths>`, `uv run ruff format --check <paths>`, `uv run mypy <pkg>` or `uv run pyright <paths>`, and `uv run pytest <path>::<test> -x`.
- For ruff findings, run `ruff check --fix` (safe fixes), then `ruff format`. Apply `--unsafe-fixes` only after reading `ruff check --diff --unsafe-fixes`, because an unsafe fix can change behavior (an exception type, a comment). Re-run until nothing changes. Suppress with `# noqa: <code>` and a reason, not a bare `# noqa`, and ask the user when a finding has more than one reasonable fix.
- Exercise what the type checker can't prove, such as the raised exception, resource closure, import behavior, and task completion or cancellation.
- `python -X dev` (or `-W error::ResourceWarning`) surfaces unclosed resources. `PYTHONASYNCIODEBUG=1` reports slow callbacks and never-awaited coroutines.
- When the repo uses pytest, read [references/pytest.md](references/pytest.md) before adding or changing tests.
- Use `efficient:testing` to choose which regression tests to add.

## Reliability and observability

- Before adding retries, timeouts, batch handling, or a queue worker, read [references/reliability.md](references/reliability.md).
- Before adding structured logging, correlation IDs, or metrics, read [references/observability.md](references/observability.md).

## Performance

Before changing code for speed or memory, read [references/performance.md](references/performance.md).

## Failure triage

| Signal | Look first at | Avoid |
| --- | --- | --- |
| Type error | Runtime contract; narrow at the boundary, then fix the annotation or code | `cast`, `Any`, or a broad ignore |
| `ResourceWarning` or pending-task warning | The owner and exit path of the resource or task | Sleeps, finalizers, test-order luck |
| Async hang or lost cancellation | A minimized task graph; awaits, timeouts, shutdown | Retries or swallowing `CancelledError` |
| Works in checkout, fails installed | The built artifact (see `efficient:python-packaging`) | Patching `sys.path` |
