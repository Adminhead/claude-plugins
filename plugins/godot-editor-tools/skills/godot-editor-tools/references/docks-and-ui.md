# Docks, menus and editor UI

Checked against the Godot 4.7.2 class reference (`EditorPlugin`, `EditorDock`, `EditorInterface`) and the "Making plugins" tutorial, 2026-10-17. `EditorDock` and `add_dock` arrived in Godot 4.6; `EditorDock` is still marked experimental.

## Contents

- Docks with `EditorDock`
- Bottom panels
- Supporting Godot before 4.6
- Tool menu items and dialogs
- Main-screen plugins
- Editor theme and scale
- Embedding an inspector or resource picker

## Docks with `EditorDock`

`add_control_to_dock`, `remove_control_from_docks`, `add_control_to_bottom_panel`, `remove_control_from_bottom_panel` and `set_dock_tab_icon` are deprecated. Wrap the content in an `EditorDock` and add that:

```gdscript
@tool
extends EditorPlugin

var _dock: EditorDock

func _enter_tree() -> void:
	_dock = EditorDock.new()
	_dock.title = "My Tool"
	_dock.icon_name = &"Node"                    # an editor theme icon, or set dock_icon to a Texture2D
	_dock.default_slot = EditorDock.DOCK_SLOT_RIGHT_UL
	_dock.layout_key = "my_tool"                 # stable key for the saved editor layout
	_dock.add_child(preload("my_dock.tscn").instantiate())
	add_dock(_dock)

func _exit_tree() -> void:
	if _dock:
		remove_dock(_dock)
		_dock.queue_free()
		_dock = null
```

`EditorDock` members: `title`, `title_color`, `dock_icon` or `icon_name`, `default_slot` (`DOCK_SLOT_LEFT_UL`, `LEFT_BL`, `LEFT_UR`, `LEFT_BR`, `RIGHT_UL`, `RIGHT_BL`, `RIGHT_UR`, `RIGHT_BR`, `BOTTOM`, `BOTTOM_L`, `BOTTOM_R`, or `DOCK_SLOT_NONE` to float), `available_layouts` (bitmask of `DOCK_LAYOUT_VERTICAL`, `HORIZONTAL`, `FLOATING`), `closable`, `global` (listed in Editor → Editor Docks), `transient` (context docks opened only for a selection, like the TileMap editor), `dock_shortcut`, `force_show_icon`. Methods: `open()`, `close()`, `make_visible()` (open and focus).

The editor remembers where the user moved the dock; removing and re-adding it resets it to `default_slot`. Override `_update_layout(layout)` to switch the content between vertical and horizontal arrangements, and `_save_layout_to_config(config, section)` / `_load_layout_from_config(config, section)` to persist dock state with the editor layout.

A dock script can also be the `EditorDock` itself (`@tool extends EditorDock`) when the dock has its own logic.

Set a `custom_minimum_size` on the content root so the dock is usable at default widths.

## Bottom panels

Use the same `EditorDock` with `default_slot = EditorDock.DOCK_SLOT_BOTTOM` (bottom-panel tab). Call `_dock.make_visible()` to bring it forward, for example when a long job starts.

## Supporting Godot before 4.6

If the addon must load on 4.5 or older, branch on the engine version and keep the old calls in the fallback path:

```gdscript
var _dock  # untyped: EditorDock doesn't exist before 4.6

func _enter_tree() -> void:
	var content: Control = preload("my_dock.tscn").instantiate()
	if ClassDB.class_exists(&"EditorDock"):
		_dock = ClassDB.instantiate(&"EditorDock")
		_dock.title = "My Tool"
		_dock.add_child(content)
		call(&"add_dock", _dock)
	else:
		_dock = content
		add_control_to_dock(DOCK_SLOT_RIGHT_UL, _dock)

func _exit_tree() -> void:
	if _dock == null:
		return
	if ClassDB.class_exists(&"EditorDock"):
		call(&"remove_dock", _dock)
	else:
		remove_control_from_docks(_dock)
	_dock.queue_free()
	_dock = null
```

Calling `add_dock` directly, or typing a variable as `EditorDock`, fails to parse on engines that lack them, hence `ClassDB` and `call()`. On 4.6+ the deprecated call in the fallback branch only warns.

## Tool menu items and dialogs

`add_tool_menu_item("My Tool: Do Thing", _do_thing)` adds an entry under **Project → Tools**; `add_tool_submenu_item(name, popup_menu)` adds a submenu. Remove with `remove_tool_menu_item(name)` in `_exit_tree`.

For dialogs, create an `AcceptDialog`/`ConfirmationDialog` and show it with `EditorInterface.popup_dialog_centered(dialog)` (the dialog must have no parent yet), or add it to `EditorInterface.get_base_control()` yourself and call `popup_centered()`. Free it when closed or in `_exit_tree`. File pickers: `EditorFileDialog` (editor-styled, knows `res://`). Quick-open style pickers: `EditorInterface.popup_quick_open(callback, base_types)`; the callback gets the chosen path, or an empty string on cancel.

Toasts in the editor's bottom-right corner: `EditorInterface.get_editor_toaster().push_toast(text, EditorToaster.SEVERITY_INFO)`.

## Main-screen plugins

A plugin that adds a top-level editor tab next to 2D, 3D, Script and AssetLib:

```gdscript
@tool
extends EditorPlugin

var _panel: Control

func _enter_tree() -> void:
	_panel = preload("main_panel.tscn").instantiate()
	EditorInterface.get_editor_main_screen().add_child(_panel)
	_make_visible(false)

func _exit_tree() -> void:
	if _panel:
		_panel.queue_free()

func _has_main_screen() -> bool:
	return true

func _make_visible(visible: bool) -> void:
	if _panel:
		_panel.visible = visible

func _get_plugin_name() -> String:
	return "My Tool"

func _get_plugin_icon() -> Texture2D:
	return EditorInterface.get_editor_theme().get_icon(&"Node", &"EditorIcons")
```

Set the panel's size flags to expand so it fills the main screen.

## Editor theme and scale

- Use editor theme icons and colors so the tool matches light and dark themes: `EditorInterface.get_editor_theme().get_icon(&"Save", &"EditorIcons")`, `get_color(&"accent_color", &"Editor")`.
- Multiply hard-coded pixel sizes by `EditorInterface.get_editor_scale()` so the UI works on HiDPI screens.
- SVG icons in the addon: enable the Import options "Scale with Editor Scale" and "Convert Colors with Editor Theme" (Editor section).

## Embedding an inspector or resource picker

- Godot 4.7: `EditorInspector.create_default_inspector(filter_line_edit)` returns an inspector configured like the Inspector dock; pass a `LineEdit` to filter properties live, then call `inspector.edit(object)`.
- `EditorResourcePicker` (set `base_type`, connect `resource_changed`) gives the Inspector's resource dropdown for a custom panel. Editor-only; never use it in game UI.
- `EditorInterface.inspect_object(object)` shows an object in the real Inspector dock instead.
