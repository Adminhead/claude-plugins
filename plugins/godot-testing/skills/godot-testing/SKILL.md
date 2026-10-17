---
name: godot-testing
description: Writes and runs Godot 4 tests with GUT, gdUnit4 or a bare SceneTree runner, picking from what the project has. Covers test layout and naming, doubles and signals, headless runs with exit codes, hangs and timeouts, and a CI job. Use for `test_*.gd`, `addons/gut`, `addons/gdUnit4`, "test this Godot script" or Godot CI.
---

# Godot testing

Pick the test framework the project already uses, write tests in its conventions, and run them headless with an exit code CI can gate on. General TDD discipline stays in `unit-testing`; GDScript language and scene work stay in `godot`; export builds in `godot-export`.

## 1. Detect what the project has

Check in this order and use the first match. Do not add a second framework to a project that has one.

| Signal | Framework | Read |
| --- | --- | --- |
| `addons/gut/` or `.gutconfig.json`, tests that `extends GutTest` | GUT | [references/gut.md](references/gut.md) |
| `addons/gdUnit4/`, tests that `extends GdUnitTestSuite`, `[TestSuite]` C# classes, `gdUnit4.api` in the `.csproj` | gdUnit4 | [references/gdunit4.md](references/gdunit4.md) |
| Neither, and the user does not want an addon | Bare SceneTree runner | Section 4 below |

Read `plugin.cfg` in the addon folder for the installed version, and `config/features` in `project.godot` for the Godot version, before relying on a version-specific API. The references list which addon versions match which Godot versions.

No framework yet and the user wants one: GDScript-only project, choose GUT; C# or mixed project, or heavy scene-input testing, choose gdUnit4. Install from the Asset Library or the release zip into `addons/`, then enable it in Project Settings > Plugins.

| | GUT | gdUnit4 |
| --- | --- | --- |
| Languages | GDScript | GDScript and C# (C# via gdUnit4Net, `dotnet test`) |
| Base class | `extends GutTest` | `extends GdUnitTestSuite`; C# `[TestSuite]` class |
| Discovery | Files with the `test_` prefix in the configured dirs; methods `test_*` | Any script extending `GdUnitTestSuite`; methods `test_*` |
| Doubles | `double()`, `partial_double()`, `stub()`, spies | `mock()`, `spy()`, `do_return()`, `verify()` (GDScript only; C# uses Moq or similar) |
| Scenes | `add_child_autofree()`, `wait_*` helpers, input sender | `auto_free()`, `scene_runner()` with input simulation |
| CLI | `addons/gut/gut_cmdln.gd` | `addons/gdUnit4/runtest.sh` (runs `bin/GdUnitCmdTool.gd`) |
| Exit codes | 0 pass, 1 fail | 0 pass, 100 fail, 101 warnings, 103 headless refused |
| Best for | Pure GDScript projects | C# or mixed projects, UI and input tests |

## 2. Lay out tests

```
res://
├── src/ (or scripts/, scenes/)
└── test/
    ├── unit/          # one test file per class, no scene tree needed
    └── integration/   # scenes, autoloads, signals across nodes
```

- `test/` is the default for both GUT's suggested setup and gdUnit4's test root. Follow the project if it already uses `tests/`.
- GUT: files `test_<thing>.gd`, methods `func test_<behaviour>()`, inner classes grouping tests start with `Test`.
- gdUnit4 GDScript: methods `func test_<behaviour>()`; its generator names files `<thing>_test.gd`. C#: `<Thing>Test.cs`, a `[TestSuite]` class with `[TestCase]` methods.
- Add a `.gdignore` to folders that must not be imported. Do not put tests under `addons/`.

## 3. Write the tests

- One behaviour per test, named for it. Arrange, act, assert.
- Test the public API of the class or scene. Go through signals and return values, not private fields.
- Free what you create: GUT `add_child_autofree()` / `autofree()`, gdUnit4 `auto_free()`. Leaked nodes show up as orphans and can fail runs.
- Watch signals before the action that emits them (GUT `watch_signals(obj)`, gdUnit4 `monitor_signals(obj)`).
- Double or mock collaborators, never the unit under test.
- Await with a bound: GUT `wait_for_signal(sig, max_seconds)` / `wait_until`, gdUnit4 `await assert_signal(obj).wait_until(ms).is_emitted(...)`. A bare `await obj.sig` hangs the run if the signal never fires.
- Compare floats with a margin (GUT `assert_almost_eq`, gdUnit4 `is_equal_approx`).

**Do not test:** engine internals (that `add_child` works, that `@export` shows in the inspector); private implementation details; pixel output (test the data that drives the visuals); one-line wrappers around built-ins; every imaginable invalid input instead of the documented contract.

## 4. Bare SceneTree runner (no addon)

For pure logic in a project without a test addon. Run with `godot --headless --path . --script res://test/test_runner.gd`.

```gdscript
# res://test/test_runner.gd
extends SceneTree

var passed := 0
var failed := 0

func _initialize() -> void:
	await run_tests()
	print("Results: %d passed, %d failed" % [passed, failed])
	quit(1 if failed > 0 else 0)  # the exit code is the CI signal

func check_eq(actual: Variant, expected: Variant, label: String) -> void:
	if actual == expected:
		passed += 1
	else:
		failed += 1
		push_error("FAIL %s: expected %s, got %s" % [label, expected, actual])

func run_tests() -> void:
	check_eq(2 + 2, 4, "add")
	# Nodes, timers and signals need a processed frame: root is not in the tree yet.
	await process_frame
	var timer := Timer.new()
	timer.one_shot = true
	root.add_child(timer)
	timer.start(0.1)
	await timer.timeout
	check_eq(timer.is_stopped(), true, "timer fires once")
	timer.queue_free()
```

## 5. Run headless

1. Godot binary: `$GODOT`, else `godot`, `godot4` or `godot-mono` on `PATH`; `--version` must print a version.
2. On a fresh checkout import first: `godot --headless --path . --import`. `.godot/` is not committed, so without it `class_name` types fail with `Identifier "X" not declared in the current scope` and imported assets fail to load.
3. Run the framework's command (references), or the bare runner above, under a timeout: `timeout 300 godot --headless ...`.
4. Read the process exit code, not only the output. Redirect stdout and stderr to files when a wrapper shell might reorder or drop them.
5. With the editor MCP connected (`godot-editor` tools), `run_headless` from the project's `godot-mcp` skill runs the same commands and returns diagnostics; save open scenes first.

## 6. CI

```yaml
- name: Import project
  run: godot --headless --path . --import
- name: Run tests
  timeout-minutes: 10
  run: <framework command from the reference>
```

Install Godot with a pinned version matching `config/features`, and keep `timeout-minutes` as a backstop. gdUnit4 also has an official GitHub Action (see its reference).

## Gotchas

- **Bare `assert()` hangs a runner.** In a debug build a failed `assert()` inside `_initialize()` prints `SCRIPT ERROR: Assertion failed` and stops the function before `quit()`, so the process never exits. Count failures and call `quit(code)` yourself.
- **Exit code 0 despite failures** means the runner never called `quit(1)`. `push_error()` alone does not change the exit code.
- **`-d` (local debugger) in CI** can stop at an interactive `debug>` prompt on a script error and hang. Leave `-d` out of CI commands, or redirect the debugger as gdUnit4's `runtest.sh` does (`--remote-debug tcp://127.0.0.1:0`).
- **Headless has no input events or rendering.** Input simulation and screenshot tests need a display (`xvfb-run` on Linux CI). gdUnit4 refuses headless runs (exit 103) unless you pass `--ignoreHeadlessMode`.
- **Current GUT fails a test on any unexpected error** (`push_error`, engine errors). Assert expected ones with `assert_push_error` / `assert_engine_error` instead of ignoring them.
- **GUT doubles return typed defaults** on current Godot: an unstubbed method with a declared return type returns `0`, `""`, `false`, `Vector2.ZERO` and so on, not `null`. Tests that expected `null` from a double fail after the upgrade. Versions are in [references/gut.md](references/gut.md).
