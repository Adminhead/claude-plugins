# Batch godot-6 report

All four are skill plugins, direct installs (not in godot-meta), no dependencies. Source: https://github.com/jame581/GodotPrompter @ bd9d18008fb1fd5919fdc297267048670b6eac1f (MIT, Copyright (c) 2026 GodotPrompter Contributors). Each ships `LICENSE-MIT` (upstream text) and a `NOTICE` with the `Upstream:` / `Paths:` lines.

## Plugins

| Plugin | Type | Description (exactly as plugin.json) | Sources | Deps |
|---|---|---|---|---|
| `godot-addons` | skill | Godot addon APIs for Beehave and LimboAI behavior trees, Phantom Camera and Dialogue Manager v4. Use when a project has addons/beehave, addons/limboai, addons/phantom_camera or addons/dialogue_manager, or when choosing, installing or writing code and .dialogue files for one of them. | GodotPrompter `beehave`, `limboai`, `phantom-camera`, `dialogue-manager` (+refs); DM rewritten from v4.1.0 docs/source | none |
| `godot-xr` | skill | Godot 4 XR with OpenXR for VR, AR and passthrough on Meta Quest, Pico and PC VR. Use for XROrigin3D and XRController3D setup, the action map, locomotion, grabbing, in-world UI, hand tracking, passthrough, spatial anchors, or a Quest export, and when project.godot has xr/openxr/enabled=true. | GodotPrompter `xr-development` (+6 refs) | none |
| `godot-gdextension` | skill | Native Godot 4 extensions with GDExtension, in C++ (godot-cpp) or Rust (godot-rust gdext). Use when a project has a .gdextension file, SConstruct or a godot-cpp submodule, or when binding a native class, building per-platform libraries, wrapping a C/C++ library, or debugging a native crash. | GodotPrompter `gdextension` (+`rust-gdext`, `debugging-native`) | none |
| `godot-editor-tools` | skill | Godot 4 editor plugins and addons. Use when writing or fixing an EditorPlugin, plugin.cfg, @tool script, inspector plugin, EditorDock, 3D gizmo, tool menu, undoable scene edits or an addon that runs a server inside the editor, or when a project has addons/*/plugin.cfg. | GodotPrompter `addon-development` (+4 refs) | none |

Layout: each plugin has `skills/<name>/SKILL.md` (48-81 lines) plus references (godot-addons 4, godot-xr 3, godot-gdextension 3, godot-editor-tools 5; 68-193 lines each, TOCs on the long ones), and `evals/trigger-<name>-{1,2,3}` (2 should-fire, 1 hard negative, same format as godot-csharp's). Examples are GDScript only, per the review; C# appears only as short notes where an addon's C# story differs.

## Validation and tests

- `claude plugin validate --strict plugins/<name>`: passed for all four.
- `python3 .claude/skills/skill-authoring/scripts/validate_skill.py plugins/<name>/skills/<name>`: valid for all four.
- Grep for `codegraph`, `claude-mem`, `coding-core:`, `github:`, `Efficient ` and the old GodotPrompter skill names (`csharp-godot`, `camera-system`, `addon-development`, ...): none, apart from the "Adapted from" lines and NOTICE paths. `add_control_to_dock` appears only as the deprecated call and in an explicit pre-4.6 fallback.
- No scripts, so no script tests. The trigger evals were written but not run (`claude plugin eval` costs model runs; left for the coordinator).

## Versions checked (gh, 2026-10-17)

- Beehave v2.9.3 (2026-08-18), LimboAI v1.8.1 (2026-08-20; GDExtension 4.6+, module on 4.7), Phantom Camera v0.11.0.3 (2026-07-19), Dialogue Manager v4.1.0 (2026-09-04, "for Godot 4.7"; v3.10.5 is the last 3.x). API facts were checked against each addon's source at those tags.
- Godot 4.7.2-stable class XML and godot-docs `4.7` branch for XR, editor plugins, GDExtension; OpenXR Vendors 5.1.0; godot-cpp 10.0.0-stable and godot-cpp-template; gdext v0.5.5 (`api-4-2`..`api-4-7`).

## Corrections made against the upstream skills (beyond the review's list)

- **godot-cpp versioning changed:** godot-cpp 10.0.0-stable (2026-09-15) is versioned independently and targets 4.3+ through `api_version`; there are no 4.6/4.7 branches. The upstream "branch must match the engine" rule (and the 4.7 docs page, which still says it) is stale. The reference explains both schemes.
- Dialogue Manager v4: beyond cues and `[if ... /]`, `set`/`do` are deprecated in favour of `$>`, inline `[$>> ...]`, `translation_key` became `static_id`, `passed_title` became `passed_cue`, plus `DialogueStateContext`, Actionable/Marker nodes and the state debugger. `DialogueManager.translation_source` no longer exists in v4 source even though the v4 Translations doc still mentions it; the C# lazy-bridge gotcha still holds in v4.
- XR: OpenXR is a core project setting, not a plugin; V-Sync is ignored under OpenXR (Godot docs), so the "disable VSync" advice was replaced with matching `physics_ticks_per_second` to the refresh rate; the action names table was wrong (`primary` is the Vector2 thumbstick; there is no `primary_x/y`); the Generic6DOFJoint3D grab can't work on a non-physics `XRController3D` and was replaced; hand trackers are `/user/hand_tracker/left|right`; the "API 29+" minimum was dropped (vendors samples leave min SDK empty); the claim that new 4.6 projects default to D3D12 on Windows was dropped (4.7 ProjectSettings default is vulkan); vendors plugin is optional since 4.6.
- GDExtension: C# can't `new` an extension class (no generated wrappers) - use `ClassDB.Instantiate`/`Call`; added `GDREGISTER_RUNTIME_CLASS`, `use_hot_reload` (off by default in godot-cpp 10), the engine's real load-error strings, and that `compatibility_minimum` is mandatory (>= 4.1).
- Editor tools: the inspector example wrote properties directly and emitted `property_changed` from an `EditorInspectorPlugin` (no such signal) - now `EditorProperty.emit_changed`; the gizmo called `get_undo_redo()`, which `EditorNode3DGizmoPlugin` lacks - now `EditorInterface.get_editor_undo_redo()`; `add_dock(EditorDock)` exists since 4.6 (not just 4.7).
- Beehave: the custom-decorator recipe now drives `before_run`/`after_run`/`running_child` like the built-ins; LimboAI `get_var` prints an error for a missing variable even with a default (noted, `complain=false`).

## godot-editor-tools and the user's addon

Read ~/Projects/voidrot/godot-mcp (read-only, nothing changed). `references/scene-editing-and-services.md` and `testing-plugins.md` cover what that addon does: TCPServer polled from `_process`, loopback + bearer token, per-project port saved in ProjectSettings, `OS.add_logger` with thread-safety, `EditorUndoRedoManager` node add/delete with `add_do_reference`, ownership rules, play/stop APIs, `OS.execute_with_pipe`, and a headless-editor test harness. New finding worth passing on: the editor sleeps 100 ms per frame when unfocused (`interface/editor/timers/unfocused_low_processor_mode_sleep_usec` default 100000, ~10 Hz), so a `_process`-polled server sees up to ~100 ms latency per poll whenever the agent drives it from a terminal.

## Deviations from the plan

- Added trigger evals (not required; matches sibling Godot plugins).
- Cross-references point at planned plugin names (`godot`, `godot-csharp`, `godot-testing`, `godot-export`, `godot-mcp-setup`, `game-ai`, `game-feel`, `game-genres`); I did not check that those plugins contain the exact sections referred to (for example `godot`'s patterns/performance guidance).

## Unverified or TODO

- The foveation story on Vulkan: the 4.7 OpenXR settings page still says foveation level is "Compatibility only" and points to `Viewport.vrs_mode = VRS_XR`, while 4.5+ added Vulkan fragment-density-map foveation and 4.7's ProjectSettings mention Vulkan subsampled images. The reference states both and says to measure.
- Whether a headless editor runs at the unfocused 10 Hz rate (worded as "may").
- `EditorResourcePreviewGenerator._handles` type name for script-class resources (hedged in the text).
- gdext `#[signal]`/`signals()` syntax checked against the macro docs, not compiled; C++ samples not compiled.
- Trigger evals not run.

## Suggested follow-ups

- `recommend-plugins`: suggest `godot-addons` on `addons/{beehave,limboai,phantom_camera,dialogue_manager}`, `godot-xr` on `xr/openxr/enabled=true`, `godot-gdextension` on `*.gdextension`, `godot-editor-tools` on `addons/*/plugin.cfg` with an `EditorPlugin` script.
- `game-genres/references/dialogue.md` should point to `godot-addons` for Dialogue Manager v4 (review item).
- Upkeep: `git -C 3rd-party/godot-prompter log bd9d180..HEAD -- skills/{beehave,limboai,phantom-camera,dialogue-manager,xr-development,gdextension,addon-development}`; recheck addon versions when their minors change.
- Run `claude plugin eval` on the four eval suites.
