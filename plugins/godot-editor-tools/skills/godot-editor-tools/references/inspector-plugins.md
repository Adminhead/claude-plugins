# Inspector plugins

Checked against the Godot 4.7 "Inspector plugins" tutorial and the `EditorInspectorPlugin`, `EditorProperty`, `EditorInspector` and `EditorContextMenuPlugin` class reference, 2026-10-17.

## Contents

- How the pieces fit
- A custom property editor
- Buttons and extra controls
- Context menu entries (4.7)
- Resource previews
- Checklist

## How the pieces fit

- `EditorInspectorPlugin` decides which objects and properties it handles. Register it from the `EditorPlugin` with `add_inspector_plugin(plugin)` and remove it with `remove_inspector_plugin(plugin)`.
- `EditorProperty` is the widget for one property. It reads the value in `_update_property()` and reports edits with `emit_changed(property, value)`, which the editor turns into an undoable action.
- The plugin never writes the property itself. Setting `object.value = x` from a button bypasses undo/redo and the "scene modified" mark.

| `EditorInspectorPlugin` virtual | Called | Notes |
|---|---|---|
| `_can_handle(object)` | When the Inspector edits an object | Return true only for your types |
| `_parse_begin(object)` / `_parse_end(object)` | Before / after all properties | Add controls with `add_custom_control(control)` |
| `_parse_category(object, category)` / `_parse_group(object, group)` | At each header | |
| `_parse_property(object, type, name, hint_type, hint_string, usage_flags, wide)` | Per property | Call `add_property_editor(name, editor)`; return true to hide the default editor |

## A custom property editor

```gdscript
# plugin.gd
@tool
extends EditorPlugin

var _inspector_plugin: EditorInspectorPlugin

func _enter_tree() -> void:
	_inspector_plugin = preload("spawn_weight_inspector.gd").new()
	add_inspector_plugin(_inspector_plugin)

func _exit_tree() -> void:
	remove_inspector_plugin(_inspector_plugin)
	_inspector_plugin = null
```

```gdscript
# spawn_weight_inspector.gd
@tool
extends EditorInspectorPlugin

const WeightEditor := preload("weight_editor.gd")

func _can_handle(object: Object) -> bool:
	return object is SpawnTable

func _parse_property(object: Object, type: Variant.Type, name: String, hint_type: PropertyHint,
		hint_string: String, usage_flags: int, wide: bool) -> bool:
	if type == TYPE_FLOAT and name.ends_with("_weight"):
		add_property_editor(name, WeightEditor.new())
		return true
	return false
```

```gdscript
# weight_editor.gd
@tool
extends EditorProperty

var _slider := HSlider.new()
var _updating := false

func _init() -> void:
	_slider.min_value = 0.0
	_slider.max_value = 1.0
	_slider.step = 0.01
	_slider.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	add_child(_slider)
	add_focusable(_slider)
	_slider.value_changed.connect(_on_value_changed)

func _on_value_changed(value: float) -> void:
	if _updating:
		return
	emit_changed(get_edited_property(), value)

func _update_property() -> void:
	var value: float = get_edited_object()[get_edited_property()]
	_updating = true
	_slider.value = value
	_updating = false
```

The `_updating` guard stops `_update_property` from echoing back as a new edit. `add_focusable` lets the editor manage keyboard focus for the control. `set_bottom_editor(control)` puts a large control under the label row instead of beside it.

## Buttons and extra controls

For an action rather than a value (a "Bake" or "Reset" button), add a control in `_parse_begin` or `_parse_end` and perform the change through undo/redo:

```gdscript
func _parse_end(object: Object) -> void:
	var button := Button.new()
	button.text = "Normalize weights"
	button.pressed.connect(_normalize.bind(object))
	add_custom_control(button)

func _normalize(table: SpawnTable) -> void:
	var ur := EditorInterface.get_editor_undo_redo()
	ur.create_action("Normalize spawn weights", UndoRedo.MERGE_DISABLE, table)
	ur.add_do_property(table, &"weights", table.normalized_weights())
	ur.add_undo_property(table, &"weights", table.weights)
	ur.commit_action()
```

Passing the edited object as the action's context puts the action in that scene's history (see the undo/redo section of scene-editing-and-services.md).

## Context menu entries (4.7)

`EditorContextMenuPlugin` with `CONTEXT_SLOT_INSPECTOR_PROPERTY` adds entries to a property's right-click menu. Register with `add_context_menu_plugin(EditorContextMenuPlugin.CONTEXT_SLOT_INSPECTOR_PROPERTY, plugin)`. `_popup_menu(paths)` receives `[object_id, property_name]` as strings (get the object with `instance_from_id(int(paths[0]))`); add items with `add_context_menu_item(name, callback, icon)`, and the callback receives the `EditorProperty`. Other slots cover the scene tree, FileSystem, script editor and 2D editor menus.

## Resource previews

An `EditorResourcePreviewGenerator` draws thumbnails for a custom resource type in the FileSystem dock and resource pickers:

```gdscript
@tool
extends EditorResourcePreviewGenerator

func _handles(type: String) -> bool:
	return type == "Resource"  # the native base type; check the script in _generate

func _generate(resource: Resource, size: Vector2i, metadata: Dictionary) -> Texture2D:
	var item := resource as ItemData
	if item == null or item.icon == null:
		return null
	var image := item.icon.get_image()
	image.resize(size.x, size.y, Image.INTERPOLATE_LANCZOS)
	return ImageTexture.create_from_image(image)
```

Register with `EditorInterface.get_resource_previewer().add_preview_generator(gen)` and remove it in `_exit_tree`. `_handles` receives a type name; a script-class resource may arrive as its native base (`"Resource"`), so print what arrives once and filter by script in `_generate`. Generation runs on a background thread, so only touch the resource and thread-safe APIs there.

## Checklist

- [ ] `_can_handle` returns true only for the intended types
- [ ] `_parse_property` returns true only where it added a replacement editor
- [ ] Edits go through `emit_changed` or an `EditorUndoRedoManager` action, never direct writes
- [ ] Every inspector plugin, context-menu plugin and preview generator is removed in `_exit_tree`
- [ ] All scripts involved are `@tool`
