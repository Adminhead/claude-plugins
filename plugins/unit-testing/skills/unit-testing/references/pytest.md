# pytest idioms

Read this when writing or changing a Python test with pytest. It covers how to express a test, not which command runs it (`framework-runners.md`). Use only plugins and helpers the project already depends on; check its lockfile or `pyproject.toml` before reaching for `pytest-asyncio`, `freezegun`, `pytest-mock` or `hypothesis`.

Trimmed and adapted from wshobson's `python-testing-patterns` skill (github.com/wshobson/agents, MIT). Config and plugin facts checked against the pytest 9 docs and the pytest-asyncio docs via Context7.

## Contents

- Shape and naming
- Fixtures
- Parametrize
- Exceptions and warnings
- Environment, files and time
- Mocks at the boundary
- Async tests
- Markers and configuration

## Shape and naming

Plain functions named `test_<unit>_<scenario>_<outcome>` with bare `assert`; pytest rewrites asserts to show both sides on failure, so don't use `assertEqual`-style helpers in new pytest code.

```python
def test_parse_duration_seconds_suffix_returns_seconds():
    assert parse_duration("90s") == timedelta(seconds=90)
```

One behavior per test. If a test needs "and" in its name, split it.

## Fixtures

- Put setup in a fixture, teardown after `yield`. Teardown runs even when the test fails.
- Default to function scope. Widen to `module` or `session` only for expensive, read-only resources, never for mutable state a test can change.
- Shared fixtures go in the nearest `conftest.py`; pytest discovers them without imports.
- Request built-ins instead of hand-rolling: `tmp_path` (a fresh `pathlib.Path`), `monkeypatch`, `capsys`/`caplog`, `request`.
- Factory fixtures (a fixture that returns a function) beat many near-identical fixtures when tests need variations.

```python
@pytest.fixture
def make_order():
    def _make(total=Decimal("10.00"), **overrides):
        return Order(id="o-1", total=total, **overrides)
    return _make
```

## Parametrize

Use `@pytest.mark.parametrize` for the same assertion over several required cases, with `ids` so failures name the case. Each row should be a case the contract actually requires, not a permutation sweep.

```python
@pytest.mark.parametrize(
    ("raw", "expected"),
    [("90s", 90), ("2m", 120), ("1h", 3600)],
    ids=["seconds", "minutes", "hours"],
)
def test_parse_duration_units(raw, expected):
    assert parse_duration(raw).total_seconds() == expected
```

Use `pytest.param(..., marks=pytest.mark.xfail(reason=...))` for a single known-broken row, with an issue link in the reason.

## Exceptions and warnings

```python
with pytest.raises(ValueError, match=r"unknown unit 'x'"):
    parse_duration("5x")
```

Always pass `match` (a regex, searched against `str(exc)`) or inspect `excinfo.value`, so an unrelated `ValueError` doesn't pass. Use `pytest.warns(DeprecationWarning, match=...)` the same way.

## Environment, files and time

- `monkeypatch.setenv` / `delenv` / `setattr` undo themselves after the test. Prefer them over editing `os.environ` directly.
- `tmp_path` for any file the code writes; never write into the repo.
- Time: inject a clock where you can. Otherwise use the project's tool (`freezegun`'s `freeze_time`, `time-machine`) and assert against literal datetimes.
- Randomness: seed it or inject the generator.

## Mocks at the boundary

Substitute only what crosses a boundary you don't own (`references/tdd.md`). With `unittest.mock`:

- `create_autospec(RealClass, instance=True)` or `patch(..., autospec=True)` so a mock rejects calls the real API wouldn't accept.
- Patch where the name is looked up, not where it is defined: `patch("app.billing.requests.post")`, not `patch("requests.post")`, when `app.billing` did `import requests`.
- `side_effect` with a list scripts a sequence (two failures, then success) for retry logic; assert the observable result first and the call count only when the count is the contract.

## Async tests

Async tests need a plugin the project already uses (`pytest-asyncio`, `anyio`'s pytest plugin, or `pytest-trio`). With `pytest-asyncio`, check `asyncio_mode` in the config: in strict mode (its default) each test needs `@pytest.mark.asyncio` and async fixtures need `@pytest_asyncio.fixture`; pytest-asyncio doesn't evaluate a plain `@pytest.fixture` on an `async def` there (it warns now and will error later). Await an explicit event or result, never `asyncio.sleep` as synchronization.

## Markers and configuration

- Register custom markers in config and turn on `strict_markers = true` (or `--strict-markers`; pytest 9's `strict = true` also enables it) so a typo in `@pytest.mark.slow` fails instead of silently selecting nothing.
- pytest 9 reads native TOML from `[tool.pytest]` in `pyproject.toml` (or `pytest.toml`); older versions read `[tool.pytest.ini_options]`. A project can't use both tables. Follow whichever the project already has.
- Don't add a coverage threshold (`--cov-fail-under`) as part of writing a test; coverage is a diagnostic, not a quota.
