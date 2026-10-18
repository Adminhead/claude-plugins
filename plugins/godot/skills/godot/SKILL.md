---
name: godot
description: Writes, reviews and debugs Godot 4 projects (GDScript, nodes and scenes, signals, Resources, autoloads, .tscn/.tres files with uid:// and .uid sidecars). Use for any work in .gd, .tscn, .tres or project.godot, "add X to my Godot game", Control-node UI layout (anchors, containers), porting Godot 3 code or a Godot error, before routing to physics, shader, export, test, C# or networking skills.
---

# Godot

The entry point for Godot 4 work. Written for Godot 4.x and checked against 4.7; version-gated facts are tagged `4.N+:` and collected in [references/version-notes.md](references/version-notes.md).

## Orient first

1. Read `project.godot`. `config/features=PackedStringArray("4.6", "Forward Plus")`: the first token is the engine minor; match the renderer by name (`Forward Plus`, `Mobile`, `GL Compatibility`), not position; `C#` in the list or a root `.csproj` means a .NET project. Write for that version, never the newest. A `.tscn` with `format=2` or `config_version=4` means Godot 3: stop and confirm the engine with the user.
2. Note autoloads (`[autoload]`), the main scene (`run/main_scene`), input actions (`[input]`) and enabled plugins (`[editor_plugins]`).
3. Check for the editor MCP: if `godot-editor` tools are available (`get_project_info` and friends), follow the project's `godot-mcp` skill (`.claude/skills/godot-mcp/SKILL.md`) for editor work. See "Editor MCP" below.
4. Read the scene and script you are changing, plus the scenes that instance it (Grep for its `res://` path and its `uid://`).

## Route

This skill owns the language, scene tree, signals, Resources and file formats. Hand off when the task is mainly about:

| Topic | Skill |
| --- | --- |
| CharacterBody/RigidBody/Area, `move_and_slide`, collisions, raycasts, jitter, Jolt | `godot-physics` |
| `.gdshader`, ShaderMaterial, visual shaders, particles, post-processing | `godot-shaders` |
| Export presets, `--export-release`, web/Android/iOS builds, CI exports | `godot-export` |
| GUT, gdUnit4, headless test runs, `test_*.gd` | `godot-testing` |
| `.cs`, `.csproj`, `[Export]`, `partial` classes | `godot-csharp` |
| `@rpc`, MultiplayerSpawner/Synchronizer, ENet, dedicated servers | `godot-multiplayer` |
| Connecting Claude to the editor (install the godot-mcp addon) | `/godot-mcp-setup` |
| Feel, level, UI/UX, audio mix, AI, game design (engine-neutral technique) | `game-feel`, `level-design`, `game-ui`, `game-audio`, `game-ai`, `game-design` |

Thin topics stay here as references. Read the one that matches the task:

| Task | Read |
| --- | --- |
| Typing, annotations, lifecycle, `await`, lambdas, `match`, Godot 3 renames | [references/gdscript.md](references/gdscript.md) |
| Scene composition, instancing, autoloads, node choice, custom Resources | [references/scenes-and-resources.md](references/scenes-and-resources.md) |
| Signals, groups, connection flags, awaiting with a timeout | [references/signals-groups.md](references/signals-groups.md) |
| Editing `.tscn`/`.tres` text, `uid://`, `.uid` files, merge conflicts | [references/tscn-tres-format.md](references/tscn-tres-format.md) |
| State machines, event bus, components, pooling, scene manager, wiring | [references/patterns.md](references/patterns.md) |
| AnimationPlayer, AnimationTree, tweens | [references/animation.md](references/animation.md) |
| Audio players, buses, streams | [references/audio.md](references/audio.md) |
| Control layout, themes, HUD, stretch modes | [references/ui-control.md](references/ui-control.md) |
| InputMap, input callbacks, rebinding | [references/input-map.md](references/input-map.md) |
| TileMapLayer, canvas layers, Parallax2D, 2D lights | [references/2d.md](references/2d.md) |
| 3D scenes, renderers, lighting, environment, GridMap | [references/3d-scene.md](references/3d-scene.md) |
| Camera2D/Camera3D, SpringArm3D, split screen | [references/camera.md](references/camera.md) |
| NavigationRegion, NavigationAgent, avoidance | [references/navigation.md](references/navigation.md) |
| `tr()`, CSV/PO translations, RTL | [references/localization.md](references/localization.md) |
| Importing textures, glTF, audio; `.import` files | [references/import-pipeline.md](references/import-pipeline.md) |
| Save files, settings, `user://`, migrations | [references/save-and-config.md](references/save-and-config.md) |
| Profiler, monitors, hot paths | [references/performance.md](references/performance.md) |
| Threads, WorkerThreadPool, background loading | [references/threading.md](references/threading.md) |
| `@tool` scripts, configuration warnings, EditorPlugin basics | [references/tool-scripts.md](references/tool-scripts.md) |
| Error messages, the debugger, tracing signals | [references/debugging.md](references/debugging.md) |
| What changed between 4.x minors | [references/version-notes.md](references/version-notes.md) |

## Editor MCP

When `godot-editor` tools are available, follow the project's `godot-mcp` skill for editor work: scene and node edits with undo, `save_scene`, `create_script`/`edit_script` diagnostics, `run_headless` diagnostics, `import_assets`, `build_dotnet`. This skill never repeats its tool table.

- Don't hand-edit a `.tscn` the editor has open: the editor overwrites it on its next save. Edit through the tools, then `save_scene`.
- `run_headless` reads files on disk, so save first. Godot exits 0 after a script error, so read its `diagnostics`, not the exit code.
- Without the server, edit files and verify with the `godot` CLI (below). To connect Claude to the editor, suggest `/godot-mcp-setup`.

## GDScript defaults

- Type everything: `var speed: float = 200.0`, `func hit(amount: int) -> void:`, `Array[Enemy]`, 4.4+: `Dictionary[StringName, int]`. Use `:=` only where the type is obvious from the right side.
- Node references via `@onready var sprite: Sprite2D = $Sprite2D`, or `%Name` (scene-unique) for deep nodes; never in `_init()`.
- Movement and physics in `_physics_process(delta)`; visuals in `_process(delta)`; one-shot input in `_unhandled_input(event)`.
- Signals up, calls down: a child emits, the parent connects with a Callable (`hit.connect(_on_hit)`) and calls child methods directly. Cross-scene events go through an autoload bus.
- `queue_free()`, not `free()`; after any `await`, recheck other nodes with `is_instance_valid()`.
- Prefer `push_error()` and return over `assert()` in code that tests or headless runs reach: a failed assert breaks into the debugger and can hang a headless runner.
- Override engine callbacks in subclasses with `super()` when the parent class implements them.

## Scene defaults

- One scene, one responsibility. Compose with child scenes (HealthComponent, Hitbox) and use an inherited scene only for variants that share the whole node layout.
- A `CollisionShape2D/3D` must be a direct child of its body or Area; group visuals under a `Node2D`/`Node3D`, never a plain `Node` (it breaks the transform chain).
- Instance with `preload("res://x.tscn").instantiate()`, set state, then `add_child()`. Add or remove physics nodes during a physics callback with `call_deferred`/`set_deferred`.
- `change_scene_to_file()` is deferred: the new scene is not current until the next frame.
- Custom data is a `Resource` with `class_name` and `@export` fields. A `.tres` is shared by every user: `duplicate()` before per-instance mutation. Never load a user-writable `.tres` from `user://` (loading can run scripts); save game state as JSON or ConfigFile.
- `res://` is read-only in exports; write to `user://`.

## Text edits to .tscn and .tres

Prefer, in order: the editor MCP tools, a `@tool` script or `EditorScript` (`ResourceSaver.save()` writes valid files), then hand edits. Before any hand edit read [references/tscn-tres-format.md](references/tscn-tres-format.md). The rules that break projects:

- Never invent, copy or edit a `uid://`. To repair one, delete the `uid=` attribute and let the editor regenerate it.
- 4.4+: scripts and shaders have `.uid` sidecar files. Commit them, and move or rename them together with their file (or move files in the editor's FileSystem dock).
- Every `ExtResource("id")`/`SubResource("id")` must match a declared block; ids are strings.
- Renaming a node means fixing every child's `parent=`, every `[connection]` and every `NodePath`.
- Never hand-merge a `.tscn` conflict: take one side and redo the other change.

## Verify

Never report a Godot change as working without running it.

- Fresh checkout or new assets: `godot --headless --path . --import`.
- Project and scenes load: `godot --headless --path . --quit`, then read stderr for `ERROR`, `SCRIPT ERROR` and `Parse Error` (the exit code alone proves nothing).
- One script parses: `godot --headless --path . --check-only --script res://path/to/file.gd` (a quick parse; confirm with the load check, or use the MCP `validate_script` when connected).
- Tests: follow `godot-testing`. With the editor MCP: `save_scene`, then `run_headless` and read `diagnostics`.
- If `godot` is not on `PATH` (check `GODOT` env), say that nothing was run.

## Gotchas

- Most Godot material online is Godot 3. Tells: `yield`, `export var`/`onready var` without `@`, `.instance()`, `connect("sig", self, "_m")`, `KinematicBody2D`, `Spatial`, `File.new()`. Translate with the table in [references/gdscript.md](references/gdscript.md).
- `move_and_slide()` takes no arguments in 4.x; it uses the body's `velocity` property.
- Typed arrays don't convert: assigning an `Array[Node2D]` to an `Array[Node]` variable fails; use `Array.assign()`.
- `class_name` must be unique project-wide.
- 4.5+: `duplicate(true)` copies only resources internal to the file; use `duplicate_deep(Resource.DEEP_DUPLICATE_ALL)` for the 4.4 behaviour.
- 4.4+: `@export_file` stores `uid://` paths when set in the Inspector; 4.5+: `@export_file_path` keeps `res://`.
- Group names are global to the SceneTree, and `call_group()` silently skips nodes without the method.
