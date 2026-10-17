# Pytest

Read this when the repository already uses pytest and you are adding or changing tests. Use the installed pytest version and existing plugins and config (`[tool.pytest.ini_options]`, `conftest.py`). Don't install pytest, plugins, or new runner configuration for a single change.

## Fixtures

- Keep fixtures function-scoped unless sharing is both safe and needed. A broader scope must not leak state between tests or outlive what it owns.
- Release resources in a `yield` fixture so cleanup runs on success and failure.
- Prefer built-ins over hand-rolled setup: `tmp_path` for files, `monkeypatch` for env vars, attributes, and `sys.path`, and `caplog`/`capsys` for output.

## Parametrize

- Use `@pytest.mark.parametrize` only when every case exercises distinct behavior, a boundary, or a failure contract. Give cases readable `ids`.
- Write a separate test when setup or assertions differ enough that a table would hide the purpose.
- Assert exceptions with `pytest.raises(ErrType, match=...)` and match only the stable part of the message.

## Mocking

- Mock only boundaries the code doesn't own, such as network, filesystem, clock, subprocess, credentials, or third-party services.
- Patch the name where the unit under test looks it up (`mod_under_test.requests`, not `requests`).
- Assert the observable request or result at that boundary. Don't mock internal collaborators just to mirror implementation steps.
- Use `patch(target, autospec=True)` so the mock enforces the real signature. A call with the wrong arguments then raises `TypeError` instead of passing silently. Since 3.8, `patch` on an async function returns an `AsyncMock` on its own.
- Assert that an async mock was awaited, not just called. `assert_awaited_once()` and `assert_awaited_once_with(...)` fail when the coroutine was created but never awaited, which `assert_called_once()` accepts.

## Markers

- Register every custom marker (`markers` under `[tool.pytest.ini_options]`) and run with `--strict-markers`, so a typo fails collection instead of creating a new marker that selects nothing.

## Async tests

- Use only the repo's existing async support (`pytest-asyncio`, `anyio`, or `pytest-trio`) and its configured mode.
- Keep loop-bound fixtures, clients, and tasks inside their loop's lifecycle.
- Await or cancel and collect every task a test creates before teardown. Close async resources on failure and cancellation too.

## Running

- Target narrowly with `pytest path/test_x.py::test_name -x`, or `-k expr` for a subset.
- `--lf` reruns the last failures. `-p no:randomly` rules out ordering effects when `pytest-randomly` is installed.
- `-W error` turns warnings into failures, which helps surface `ResourceWarning` and deprecation issues.
- When the repo has `pytest-cov`, `--cov=<pkg> --cov-report=term-missing` lists the uncovered line ranges. Read them to find behavior a test should pin, such as an untested error branch. Coverage is a diagnostic, not a target, so don't write tests to raise the number.
