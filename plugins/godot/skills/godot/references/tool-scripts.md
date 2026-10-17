# Tool scripts and small editor plugins

`@tool` scripts that run in the editor, configuration warnings, one-off `EditorScript`s, and the basics of an `EditorPlugin` (custom types, menu items, docks). Inspector plugins, gizmos and larger editor tooling are beyond this reference; read the `EditorPlugin`, `EditorInspectorPlugin` and `EditorNode3DGizmoPlugin` class docs for the project's version.

Contents: `@tool` basics; One-off editor actions: `EditorScript`; EditorPlugin skeleton; C# note.

## `@tool` basics

- `@tool` on the first line makes the script run inside the editor as well as in the game. Its setters, `_ready`, `_process` and `_draw` run while the scene is open.
- `@tool` scripts **do ship** in exports and run normally at runtime. Only editor-only classes (`EditorPlugin`, `EditorInterface` and the like) are missing in an exported game.
- Guard behaviour with `Engine.is_editor_hint()`:

```gdscript
@tool
extends Node2D

@export var radius := 32.0:
	set(value):
		if is_equal_approx(value, radius): return   # avoid setter loops
		radius = value
		queue_redraw()
		update_configuration_warnings()

@export var target: Node2D:
	set(value):
		target = value
		update_configuration_warnings()

func _process(delta: float) -> void:
	if Engine.is_editor_hint():
		return                  # gameplay below only runs in the game
	rotation += delta

func _draw() -> void:
	draw_circle(Vector2.ZERO, radius, Color(1, 1, 1, 0.3))

func _get_configuration_warnings() -> PackedStringArray:
	var w := PackedStringArray()
	if target == null:
		w.append("Assign a target node.")
	return w
```

- `_get_configuration_warnings()` shows the warning icon in the Scene dock. The script must be `@tool` for it to run; call `update_configuration_warnings()` whenever a property it checks changes.
- Every script a `@tool` script calls at edit time must also be `@tool`, or the call fails (the non-tool script is a placeholder in the editor).
- Exported setters run when the scene loads, before `_ready` and before children exist. Check `is_node_ready()` (or `is_inside_tree()`) before touching children or `get_tree()`.
- Changes a tool script makes to nodes are saved into the scene. Keep editor previews out of saved data: draw them in `_draw`, or add helper nodes with no `owner` so they are never saved.
- Saving a tool script reloads it; if the editor freezes on reload, look for a setter that triggers itself or an unguarded `while` loop.
- Tool scripts run project code inside the editor, so a crash takes the editor down. Commit before experimenting.

## One-off editor actions: `EditorScript`

```gdscript
@tool
extends EditorScript

func _run() -> void:
	var root := get_scene()          # the edited scene's root
	for n in root.find_children("*", "Sprite2D"):
		n.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
```

- Open it in the script editor and use File > Run. Changes are applied to the open scene; save the scene afterwards.
- `EditorInterface` (a singleton in 4.2+) reaches the selection, open scenes and the file system.

## EditorPlugin skeleton

```
addons/my_tool/
  plugin.cfg
  plugin.gd
```

```ini
[plugin]
name="My Tool"
description="Adds MyNode and a Project menu action."
author="Me"
version="0.1.0"
script="plugin.gd"
```

```gdscript
@tool
extends EditorPlugin

var _dock: EditorDock

func _enter_tree() -> void:
	add_custom_type("MyNode", "Node2D", preload("my_node.gd"), preload("icon.svg"))
	add_tool_menu_item("My Tool: rebuild", _rebuild)
	_dock = EditorDock.new()
	_dock.title = "My Tool"
	_dock.default_slot = EditorDock.DOCK_SLOT_RIGHT_UL
	_dock.add_child(preload("dock.tscn").instantiate())
	add_dock(_dock)

func _exit_tree() -> void:             # undo everything from _enter_tree
	remove_dock(_dock)
	_dock.queue_free()
	remove_tool_menu_item("My Tool: rebuild")
	remove_custom_type("MyNode")

func _rebuild() -> void:
	pass
```

- `script` in `plugin.cfg` is relative to the plugin folder. Enable the plugin in Project Settings > Plugins, which adds it to `[editor_plugins] enabled` in `project.godot`.
- Everything added in `_enter_tree()` must be removed in `_exit_tree()`, or disabling the plugin leaves orphaned docks and duplicate menu items.
- Docks: the 4.7 docs mark `add_control_to_dock()` / `remove_control_from_docks()` deprecated in favour of `add_dock(EditorDock)` / `remove_dock()`. Check the project's version before using `EditorDock`; older projects use `add_control_to_dock(DOCK_SLOT_..., control)`.
- `add_custom_type` registers a type in the Add Node dialog; a `class_name` script with an `@icon("res://...svg")` annotation does the same with no plugin.
- Use `get_undo_redo()` (an `EditorUndoRedoManager`) for edits a plugin makes to the scene so Ctrl+Z works.
- Structural changes (new custom types, docks) need the plugin toggled off and on; script edits hot-reload.
- If the project has the godot-mcp editor addon, leave its `addons/godot_mcp/` alone; it manages its own plugin.

## C# note

- In C#, `[Tool]` replaces `@tool`. Wrap only editor-only classes (`EditorPlugin` subclasses, inspector plugins) in `#if TOOLS`. Wrapping a runtime `[Tool]` node class strips it from exports and breaks every scene that uses it. More in `godot-csharp`.
