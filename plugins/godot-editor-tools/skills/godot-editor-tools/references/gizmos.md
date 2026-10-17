# Gizmos and viewport tools

Checked against the Godot 4.7.2 class reference (`EditorNode3DGizmoPlugin`, `EditorNode3DGizmo`, `EditorPlugin`) and the "3D gizmo plugins" tutorial, 2026-10-17.

## Contents

- 3D gizmo plugin
- Handles with undo/redo
- Keeping the gizmo in sync
- 2D viewport tools
- Checklist

## 3D gizmo plugin

```gdscript
# plugin.gd
@tool
extends EditorPlugin

var _gizmo_plugin: EditorNode3DGizmoPlugin

func _enter_tree() -> void:
	_gizmo_plugin = preload("aim_gizmo_plugin.gd").new()
	add_node_3d_gizmo_plugin(_gizmo_plugin)

func _exit_tree() -> void:
	remove_node_3d_gizmo_plugin(_gizmo_plugin)
	_gizmo_plugin = null
```

```gdscript
# aim_gizmo_plugin.gd
@tool
extends EditorNode3DGizmoPlugin

func _init() -> void:
	create_material("line", Color(0.5, 1.0, 0.2))
	create_handle_material("handles")

func _get_gizmo_name() -> String:
	return "AimPoint"  # listed in the 3D viewport's View → Gizmos menu

func _has_gizmo(node: Node3D) -> bool:
	return node is AimPoint

func _redraw(gizmo: EditorNode3DGizmo) -> void:
	gizmo.clear()
	var node := gizmo.get_node_3d() as AimPoint
	gizmo.add_lines(PackedVector3Array([Vector3.ZERO, node.target]), get_material("line", gizmo))
	gizmo.add_handles(PackedVector3Array([node.target]), get_material("handles", gizmo), PackedInt32Array([0]))
```

All drawing is in the node's local space. Redraw everything in `_redraw` each time; the gizmo keeps nothing between calls. Other drawing calls: `add_mesh`, `add_unscaled_billboard`, `add_collision_segments` and `add_collision_triangles` (clickable selection areas). `_get_priority()` decides which plugin wins when several handle the same node.

For gizmos with per-node state, override `_create_gizmo(node)` and return a custom `EditorNode3DGizmo` subclass that implements `_redraw` and the handle methods itself.

## Handles with undo/redo

`EditorNode3DGizmoPlugin` has no `get_undo_redo()`; that method belongs to `EditorPlugin`. Use the editor's manager directly.

```gdscript
func _get_handle_name(gizmo: EditorNode3DGizmo, handle_id: int, secondary: bool) -> String:
	return "Target"

func _get_handle_value(gizmo: EditorNode3DGizmo, handle_id: int, secondary: bool) -> Variant:
	return (gizmo.get_node_3d() as AimPoint).target  # saved as `restore` for _commit_handle

func _set_handle(gizmo: EditorNode3DGizmo, handle_id: int, secondary: bool, camera: Camera3D, screen_pos: Vector2) -> void:
	var node := gizmo.get_node_3d() as AimPoint
	var origin := camera.project_ray_origin(screen_pos)
	var dir := camera.project_ray_normal(screen_pos)
	# Drag on the horizontal plane through the node.
	var plane := Plane(Vector3.UP, node.global_position.y)
	var hit: Variant = plane.intersects_ray(origin, dir)
	if hit == null:
		return  # ray parallel to the plane
	node.target = node.to_local(hit)
	node.update_gizmos()

func _commit_handle(gizmo: EditorNode3DGizmo, handle_id: int, secondary: bool, restore: Variant, cancel: bool) -> void:
	var node := gizmo.get_node_3d() as AimPoint
	if cancel:
		node.target = restore
		node.update_gizmos()
		return
	var ur := EditorInterface.get_editor_undo_redo()
	ur.create_action("Move AimPoint target")
	ur.add_do_property(node, &"target", node.target)
	ur.add_undo_property(node, &"target", restore)
	ur.add_do_method(node, &"update_gizmos")
	ur.add_undo_method(node, &"update_gizmos")
	ur.commit_action(false)  # the drag already applied the do-state
```

- `_set_handle` runs on every mouse move; `_commit_handle` once at release, or with `cancel = true` on right-click or Escape.
- Godot 4.7: override `_can_commit_handle_on_click() -> bool` to commit even when the handle didn't move (a click-to-toggle handle). It returns false by default.
- `secondary` handles (pass `secondary = true` to `add_handles`) are shown with a modifier key and let one gizmo carry two handle sets.
- Subgizmos (`_subgizmos_intersect_ray`, `_get_subgizmo_transform`, `_set_subgizmo_transform`, `_commit_subgizmos`) give per-point selection and the normal move/rotate tools, like Path3D points.

## Keeping the gizmo in sync

The editor redraws a gizmo when the node's transform changes, not when your custom property does. Call `update_gizmos()` from the property's setter in the node script (which must be `@tool`):

```gdscript
@tool
class_name AimPoint
extends Node3D

@export var target := Vector3.FORWARD:
	set(value):
		target = value
		update_gizmos()
```

## 2D viewport tools

There is no 2D gizmo plugin class. A 2D tool is the `EditorPlugin` itself:

```gdscript
@tool
extends EditorPlugin

var _edited: Path2DArea

func _handles(object: Object) -> bool:
	return object is Path2DArea

func _edit(object: Object) -> void:
	_edited = object as Path2DArea

func _make_visible(visible: bool) -> void:
	if not visible:
		_edited = null
	update_overlays()

func _forward_canvas_draw_over_viewport(overlay: Control) -> void:
	if _edited == null:
		return
	var xform := _edited.get_viewport_transform() * _edited.get_global_transform()
	for point in _edited.points:
		overlay.draw_circle(xform * point, 6.0 * EditorInterface.get_editor_scale(), Color.ORANGE)

func _forward_canvas_gui_input(event: InputEvent) -> bool:
	if _edited == null:
		return false
	# Return true to consume the event (the editor won't select or move things).
	return false
```

Convert between screen and canvas space with the viewport transform shown above and its `affine_inverse()`. Commit point edits through `EditorUndoRedoManager`, then `update_overlays()`. The 3D equivalents are `_forward_3d_gui_input(camera, event)` (returns an `AFTER_GUI_INPUT_*` constant) and `_forward_3d_draw_over_viewport(overlay)`.

## Checklist

- [ ] Gizmo plugin added and removed symmetrically
- [ ] Every handle change commits through `EditorInterface.get_editor_undo_redo()`; cancel restores the saved value
- [ ] Custom properties call `update_gizmos()` in their setters
- [ ] Node scripts the gizmo reads are `@tool`
- [ ] Sizes in overlays scale with `EditorInterface.get_editor_scale()`
