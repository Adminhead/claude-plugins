# gdUnit4

Written from the official gdUnit4 docs (godot-gdunit-labs.github.io/gdUnit4, the `documentation/` sources and `addons/gdUnit4/` code at tag v6.2.2), the gdUnit4-action README and `action.yml` (v1.3.2), and nuget.org for the C# packages (checked 2026-10-17).

Contents: versions, a GDScript suite, assertions, mocks and spies, signals, scene runner, running from the CLI, C# tests, CI.

## Versions

| gdUnit4 | Godot |
| --- | --- |
| v6.2.x (v6.2.2, 2026-10-07) | 4.5 to 4.7.1 |
| v6.1.x | 4.5 to 4.6.3 |
| v6.0.x | 4.5 |
| v5.x | 4.3, 4.4 |

The v6.2 support table stops at 4.7.1; on a newer patch, run the suite once and watch for exit code 104 (Godot version not supported). Check `addons/gdUnit4/plugin.cfg` for the installed version. Install from the Asset Library or a release zip into `addons/gdUnit4/`, then enable it in Project Settings > Plugins.

C# tests use gdUnit4Net from NuGet: `gdUnit4.api` (5.0.0 stable; 5.1.0 release candidates target Godot 4.5+), `gdUnit4.test.adapter` (3.1.x), `gdUnit4.analyzers` (1.0.0), plus `Microsoft.NET.Test.Sdk`. Check nuget.org for current versions before pinning.

## A GDScript suite

```gdscript
# res://test/unit/health_test.gd
extends GdUnitTestSuite

var _health: Health

func before_test() -> void:
	_health = auto_free(Health.new())

func test_damage_reduces_health() -> void:
	_health.max_health = 10
	_health.take_damage(3)
	assert_int(_health.current).is_equal(7)

func test_death_emits_died() -> void:
	var health: Health = monitor_signals(Health.new())  # monitored objects are auto-freed
	health.take_damage(999)
	await assert_signal(health).is_emitted(health.died)

func test_add(a: int, b: int, expected: int, _test_parameters := [[1, 2, 3], [2, 2, 4]]) -> void:
	assert_int(a + b).is_equal(expected)

func test_slow_load(_timeout := 2000) -> void:  # per-test timeout in ms (default 5 min)
	...
```

- A suite is any script that extends `GdUnitTestSuite`; file names are free (the generator writes `<name>_test.gd` under `res://test/`). Test methods start with `test_`.
- Hooks: `before()` / `after()` once per suite; `before_test()` / `after_test()` around each test. Session hooks (`GdUnitTestSessionHook`) are configured in the GdUnit settings.
- Test arguments with special names: `_timeout`, `_test_parameters`, `_do_skip`, `_skip_reason`, `_fuzzer`, `_fuzzer_iterations`, `_fuzzer_seed`. The leading `_` avoids unused-parameter warnings.
- ProjectSettings changed in a test are restored automatically.

## Assertions

Typed entry points, chained: `assert_int`, `assert_float`, `assert_str`, `assert_array`, `assert_dict`, `assert_object`, `assert_vector`, `assert_file`, `assert_signal`, `assert_error`, `assert_func`, and generic `assert_that(v)` (also for bools). Common matchers: `is_equal`, `is_not_equal`, `is_true`, `is_false`, `is_null`, `is_not_null`, `is_greater`, `is_less`, `is_between(a, b)`, `is_equal_approx(v, margin)`, `contains(...)`, `has_size(n)`, `is_empty()`. C# mirrors them: `AssertThat(v).IsEqual(x)` (typed overloads), `AssertString(s)`, `AssertSignal(obj)`.

## Mocks and spies (GDScript only)

```gdscript
var store := mock(SaveStore) as SaveStore          # class_name, or mock("res://path.gd")
do_return(true).on(store).save(any_int())
verify(store, 1).save(3)
verify_no_more_interactions(store)

var real: Inventory = spy(auto_free(Inventory.new()))
real.add("sword")
verify(real, 1).add("sword")
```

- `mock()` defaults to `RETURN_DEFAULTS` (typed defaults); `mock(Class, CALL_REAL_FUNC)` calls the real code unless overridden. Mocks and spies are auto-freed.
- Engine core functions cannot be mocked or spied on; mock your own classes.
- Argument matchers: `any()`, `any_int()`, `any_string()`, `any_class(Class)` and others.
- C# has no built-in mocking; use Moq or a similar library.

## Signals

`monitor_signals(obj)` starts recording (call it before the action), then `await assert_signal(obj).is_emitted(obj.sig)` or `.is_emitted("sig", arg1, ...)`, `.is_not_emitted(...)`, and `.wait_until(ms)` to change the timeout. Always `await` signal asserts. Prefer `Signal` references over strings.

## Scene runner

```gdscript
func test_jump() -> void:
	var runner := scene_runner("res://scenes/player.tscn")
	runner.simulate_action_pressed("jump")
	await runner.simulate_frames(10)
	assert_float(runner.get_property("velocity").y).is_less(0.0)
```

One runner per scene, auto-freed. It simulates actions, keys, mouse and touch, invokes functions (`invoke`), reads properties, and awaits signals or function results. Input events do not travel in headless mode: input tests need a display (xvfb on Linux CI).

## Run from the command line

```sh
export GODOT_BIN=/path/to/godot
./addons/gdUnit4/runtest.sh -a res://test -c          # needs a display
```

- `runtest.sh` runs `godot --path . -s -d --remote-debug tcp://127.0.0.1:0 res://addons/gdUnit4/bin/GdUnitCmdTool.gd <args>`, then copies the log. With a .NET build of Godot it runs `dotnet build --debug` first. `--godot_binary <path>` overrides `GODOT_BIN`. Windows: `runtest.cmd`.
- Options: `-a <dir|suite>` add (repeatable), `-i <suite|suite:test>` ignore, `-c` continue after failures (**the CLI stops at the first failure without it**), `-conf [file]` rerun a saved `GdUnitRunner.cfg`, `-rd <dir>` report dir (default `res://reports/`), `-rc <n>` reports kept, `--ignoreHeadlessMode`, `-help`, `--help-advanced`.
- Exit codes: `0` success, `100` failures, `101` warnings only, `103` headless mode refused, `104` Godot version not supported, `105` script errors detected.
- Reports: `index.html` and JUnit `results.xml` under the report dir.
- Headless: the script's args go after the tool path, so `--headless` cannot be added through `runtest.sh`. Without a display, either wrap it (`xvfb-run --auto-servernum ./addons/gdUnit4/runtest.sh -a res://test -c`, as the official action does), or call Godot directly and accept that input tests will not work:

  ```sh
  "$GODOT_BIN" --headless --path . -s -d --remote-debug tcp://127.0.0.1:0 \
    res://addons/gdUnit4/bin/GdUnitCmdTool.gd --ignoreHeadlessMode -a res://test -c
  ```

## C# tests

```csharp
using GdUnit4;
using static GdUnit4.Assertions;

[TestSuite]
public class HealthTest
{
    [BeforeTest] public void Setup() { /* fresh state */ }

    [TestCase]
    public void DamageReducesHealth() => AssertThat(new Health(10).TakeDamage(3)).IsEqual(7);

    [TestCase(1, 2, 3)]
    [TestCase(2, 2, 4)]
    public void Adds(int a, int b, int expected) => AssertThat(a + b).IsEqual(expected);
}
```

- Suites are plain classes with `[TestSuite]`, not subclasses. Hooks: `[Before]`, `[After]`, `[BeforeTest]`, `[AfterTest]`. `[TestCase(Timeout = 2000)]` sets a timeout.
- Run with `dotnet test` through `gdUnit4.test.adapter`, with `GODOT_BIN` set in the environment or in a `.runsettings` `<EnvironmentVariables>` block. IDE runners (Rider, Visual Studio, VS Code) use the same adapter; debugging C# tests inside the Godot editor is not supported.

## CI (GitHub Actions)

```yaml
- uses: actions/checkout@v4
- uses: godot-gdunit-labs/gdUnit4-action@v1.3.2
  with:
    godot-version: '4.7.1'     # a version gdUnit4 supports
    paths: 'res://test'
    version: 'installed'       # use the project's addons/gdUnit4; default 'latest' installs the newest release
    timeout: 10
    # godot-net: true          # C# project; dotnet-version: 'net9.0' (default net8.0)
```

The action installs Godot, restores the import cache, runs `runtest.sh` under `xvfb-run` (C#: `dotnet test` under `xvfb-run`), and publishes the JUnit report. `warnings-as-errors: true` turns exit 101 into a failure; `arguments` passes extra CLI options.
