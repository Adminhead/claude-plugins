# Testing and debugging editor plugins

Checked against the Godot 4.7 docs (running code in the editor, command line tutorial) and the `EditorInterface` class reference, 2026-10-17.

## Contents

- Reload cycle
- Debugging tool code
- Structure for testability
- Unit tests for plugin logic
- Driving a headless editor
- Release checks

## Reload cycle

- Saving a `@tool` script hot-reloads it, but registrations made in `_enter_tree` (docks, custom types, inspector plugins, servers) only change after the plugin is disabled and re-enabled.
- Toggle in Project Settings → Plugins, or from a separate `EditorScript` (File → Run in the Script editor):

```gdscript
@tool
extends EditorScript

func _run() -> void:
	EditorInterface.set_plugin_enabled("my_tool", false)
	EditorInterface.set_plugin_enabled("my_tool", true)
```

  The name is the addon folder name. Don't toggle a plugin from inside itself, and don't rewrite `editor_plugins/enabled` through `ProjectSettings` (it holds every enabled plugin).
- After a disable, check that docks, menu items and custom types are gone and nothing printed errors. A leftover means `_exit_tree` missed a removal.
- C#: build first (MSBuild panel); a failed build shows up as `Could not find type "<PluginClass>"` on enable.
- Custom types that linger after removal usually clear on an editor restart.

## Debugging tool code

- Breakpoints don't stop in tool scripts running in the editor you're working in. Run a second editor as the debuggee: **Debug → Customize Run Instances...**, put `--editor` in Main Run Args, then press Play; breakpoints hit in that child editor.
- `print`, `push_warning` and `push_error` go to the Output panel; start the editor from a terminal to see engine messages and crash backtraces too.
- `print_tree_pretty()` on `EditorInterface.get_base_control()` or the edited scene root shows the structure you're navigating.

## Structure for testability

Keep the `EditorPlugin` script thin: lifecycle, registration and wiring. Put protocol parsing, value encoding, validation and path rules in plain `RefCounted` scripts that don't call `EditorInterface`. Those can be tested without an editor; the editor-facing layer gets fewer, end-to-end tests.

## Unit tests for plugin logic

- GUT or gdUnit4 tests run the pure scripts in a headless game process (see `godot-testing` for setup and CLI runners).
- Without a framework, a `SceneTree` script works:

```gdscript
# tests/run_unit.gd  →  godot --headless --path . --script res://tests/run_unit.gd
extends SceneTree

const Codec := preload("res://addons/my_tool/value_codec.gd")

func _initialize() -> void:
	var failures := 0
	if Codec.decode("Vector2(1, 2)") != Vector2(1, 2):
		failures += 1
		printerr("decode Vector2 failed")
	quit(1 if failures > 0 else 0)
```

- `--script` runs without the editor, so editor classes and `EditorInterface` are unavailable; another reason to keep them out of the logic scripts.
- On a fresh checkout or CI, run `godot --headless --import --path .` first so resources and `class_name` caches exist.

## Driving a headless editor

For end-to-end tests of an addon that serves or automates the editor:

1. Copy a fixture project to a temporary directory, with the addon copied or symlinked into `addons/` and enabled in `project.godot` (`[editor_plugins] enabled=PackedStringArray("res://addons/my_tool/plugin.cfg")`).
2. `godot --headless --import --path <dir>` once, then start `godot --headless --editor --path <dir>` as a child process from the test harness.
3. Wait for readiness through something the addon writes (a port or token file under `.godot/`, or a log line), with a timeout; don't sleep a fixed time.
4. Exercise it (HTTP or socket requests), assert on responses and on files written to the fixture.
5. Kill the editor and delete the temp directory in teardown, even on failure. Collect its stdout and stderr for the failure report.

Notes: with no window to focus, a headless editor may run at the unfocused low-processor rate (about 10 Hz); allow for that in timeouts. `--quit-after <n>` bounds a run by iteration count. A `.NET` project needs the mono editor binary and a `dotnet` on `PATH`.

## Release checks

- Fresh empty project: copy only `addons/<name>/`, enable, use every feature, disable. No errors, nothing left behind.
- Open a project that already has the addon at an older version and upgrade in place.
- Test on the oldest Godot version `plugin.cfg` or the README claims to support.
- Bump `version` in `plugin.cfg`; commit `.uid` sidecars and `.import` files that belong to the addon's assets.
