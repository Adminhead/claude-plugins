# GUT (Godot Unit Test)

Written from the official GUT docs (gut.readthedocs.io, the `documentation/docs/` pages and `addons/gut/test.gd` at tag v9.7.1) and the 9.5 to 9.7 release notes.

Contents: versions, running from the CLI, a test file, assertions, awaiting, doubles and stubs, spies, signals, errors, memory, CI.

## Versions

| GUT | Godot | Notes |
| --- | --- | --- |
| 9.7.x (9.7.1, 2026-07-10) | 4.7 | Breaking: doubles return typed defaults, not `null` |
| 9.6.x (9.6.1) | 4.6 | `assert_push_error`/`assert_engine_error` take text only; counts moved to `*_count` |
| 9.5.0 | 4.5 (required) | Error tracking: unexpected errors fail tests |
| 7.x | 3.x | Godot 3 only |

Check `addons/gut/plugin.cfg` for the installed version and match it to `config/features` in `project.godot`. Install from the Asset Library or a release zip into `addons/gut/`, then enable GUT in Project Settings > Plugins.

## Run from the command line

```sh
godot --headless --path . --import            # fresh checkout only
godot --headless -s --path . addons/gut/gut_cmdln.gd \
  -gdir=res://test -ginclude_subdirs -gexit
```

- Exit code: `0` when all tests pass, `1` when any fail. Pending tests do not change it.
- Options: `-gdir` (repeatable or comma list), `-ginclude_subdirs`, `-gtest=res://test/unit/test_x.gd`, `-gselect=<filename part>`, `-gunit_test_name=<test name part>`, `-ginner_class=<name part>`, `-gprefix` (default `test_`), `-gsuffix` (default `.gd`), `-glog=0..3`, `-gjunit_xml_file=<path>`, `-gexit`, `-gexit_on_success`, `-gh` (help), `-gpo` (print effective options).
- Config: `res://.gutconfig.json` is loaded by default; CLI options override it. `-gprint_gutconfig_sample` prints a template; `-gconfig=` skips the file.
- In 9.6+, a headless run ignores `pause_before_teardown()` and exits when done even without `-gexit`.
- GUT's own docs use `-d` (local debugger). Leave it out of CI: a script error can stop at an interactive `debug>` prompt.

## A test file

```gdscript
# res://test/unit/test_health.gd
extends GutTest

var Health = load("res://src/health.gd")
var _health

func before_each() -> void:
	_health = autofree(Health.new())

func test_damage_reduces_health() -> void:
	_health.max_health = 10
	_health.take_damage(3)
	assert_eq(_health.current, 7)

func test_death_emits_died() -> void:
	watch_signals(_health)
	_health.take_damage(999)
	assert_signal_emitted(_health, "died")
```

- Hooks: `before_all()`, `before_each()`, `after_each()`, `after_all()`. Methods start with `test_` and take no parameters (except parameterized tests).
- A test with no assert and no `pending()`, `pass_test()` or `fail_test()` is marked risky.
- Group with inner classes named `Test...` that `extends GutTest` (one level only).
- Parameterized: `func test_add(p = use_parameters([[1, 2, 3], [2, 2, 4]])):` runs once per element; `ParameterFactory.named_parameters(names, values)` gives dictionaries.

## Assertions

Values: `assert_eq`, `assert_ne`, `assert_true`, `assert_false`, `assert_null`, `assert_not_null`, `assert_gt`, `assert_gte`, `assert_lt`, `assert_lte`, `assert_between`, `assert_not_between`, `assert_almost_eq(a, b, margin)`, `assert_almost_ne`, `assert_same`, `assert_not_same`, `assert_eq_deep`, `assert_ne_deep`, `assert_is(obj, Class)`, `assert_typeof`, `assert_not_typeof`.
Collections and strings: `assert_has`, `assert_does_not_have`, `assert_string_contains`, `assert_string_starts_with`, `assert_string_ends_with`.
Objects: `assert_has_method`, `assert_has_signal`, `assert_property`, `assert_exports`, `assert_freed`, `assert_not_freed`, `assert_connected`, `assert_not_connected`.
Files: `assert_file_exists`, `assert_file_does_not_exist`, `assert_file_empty`, `assert_file_not_empty`.

## Awaiting

All return something to `await`, and each has a timeout so a missing signal does not hang the run:
`await wait_seconds(0.5)`, `await wait_physics_frames(2)`, `await wait_process_frames(10)` (alias `wait_idle_frames`), `await wait_for_signal(obj.sig, 5)` (returns `true` if emitted, and starts watching `obj`), `await wait_until(func(): return x == 5, 2)` (the callable must return exactly `true`), `wait_while` (inverse).

## Doubles and stubs

`double()` returns a class (or a PackedScene), so instantiate it:

```gdscript
var dbl = double(Health).new()                         # class_name or loaded script
var scene = double(load("res://player.tscn")).instantiate()
var part = partial_double(Health).new()                # keeps real behaviour by default
stub(dbl.get_armor).to_return(5)                       # or stub(dbl, "get_armor")
stub(dbl, "get_armor").when_passed("fire").to_return(0)
stub(part.save).to_do_nothing()
stub(dbl.heal).to_call_super()
stub(Health, "_init").param_defaults([10])             # before double() when _init needs args
```

- Doubled methods do nothing and return a default for their declared return type: `0`, `0.0`, `""`, `&""`, `false`, `[]`, `{}`, `Vector2.ZERO`, `Color.WHITE`, `Basis.IDENTITY` and so on; `null` for `Object`, untyped or `void` methods (9.7+, for Godot 4.7). Stubbing a value of the wrong type logs a GUT error and an engine error.
- Only methods can be stubbed. A property's inline `get`/`set` cannot; if it uses separate accessor methods (`get: _get_x, set: _set_x`), stub those (and `to_call_super()` to keep them working).
- Native methods (`set_position`, ...) are not in a double of your script unless the double strategy is `INCLUDE_NATIVE`. Doubling a built-in class (`double(Node2D)`) always includes them.
- Static methods break doubling: call `ignore_method_when_doubling(Script, "method")` in `before_each`.
- Inner classes: `register_inner_classes(Script)` in `before_all`, then `double(Script.Inner)`.
- All doubled parameters default to `null`; stub `param_defaults` when `to_call_super` would pass `null` into maths.
- Doubles are freed after each test. Do not create them in `before_all`. Stubs are cleared between tests; stub in `before_each`, not `before_all`.
- Engine singletons (`Input`, `Time`, `OS`) in 9.6+: `double_singleton(Input).new()` (or `partial_double_singleton`) makes a stand-in, which the code under test must receive through a variable (`var input := Input`); it does not replace the real singleton.

## Spies

Doubles record calls to doubled methods:
`assert_called(dbl, "save")`, `assert_called(dbl.save)`, `assert_called(dbl, "save", [slot])`, `assert_not_called(dbl, "save")`, `assert_called_count(dbl.save, 2)` (Callable only; bind arguments to match them), `get_call_count(dbl, "save")`, `get_call_parameters(dbl, "save")`.

## Signals

`watch_signals(obj)` before the action, then `assert_signal_emitted(obj, "name")` or `assert_signal_emitted(obj.name)`, `assert_signal_not_emitted`, `assert_signal_emit_count(obj, "name", 2)`, `assert_signal_emitted_with_parameters(obj, "name", [args])`.

## Errors

Since 9.5 GUT fails a test that produces an unhandled `push_error`, engine error or GUT error (`push_warning` is logged but does not fail). Mark expected errors handled with `assert_push_error("text")`, `assert_push_error_count(n)`, `assert_engine_error("text")`, `assert_engine_error_count(n)`, `assert_push_warning(...)`. Each error can be matched once. `-gfailure_error_types` or `-gno_error_tracking` relax this; prefer asserting.

## Memory

`autofree(obj)`, `autoqfree(obj)`, `add_child_autofree(node)`, `add_child_autoqfree(node)` free after `after_each`; never use them in `before_all`. Children left on the test script trigger a warning. `assert_no_new_orphans()` checks for leaks (await a frame after `queue_free()` first).

## CI (GitHub Actions)

```yaml
- uses: actions/checkout@v4
- uses: chickensoft-games/setup-godot@v2
  with:
    version: 4.7.2          # match config/features
    use-dotnet: false       # true for C# projects (the default)
- run: godot --headless --path . --import
- name: GUT
  timeout-minutes: 10
  run: godot --headless -s --path . addons/gut/gut_cmdln.gd -gdir=res://test -ginclude_subdirs -gexit -gjunit_xml_file=user://results.xml
```
