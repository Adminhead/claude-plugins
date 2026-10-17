# Cameras

Camera2D and Camera3D node API: follow and smoothing, limits and room zones, shake wiring, SpringArm3D and orbit rigs, switching cameras, split screen. Written for Godot 4.x, checked against 4.7.

Design technique (trauma-based shake, look-ahead, framing, deadzone tuning) is in `game-feel`. This file is how to wire it in Godot.

Contents: Camera2D; Camera3D; Switching cameras; Split screen.

## Camera2D

| Property | Default | Notes |
|---|---|---|
| `enabled` / `make_current()` | | One current camera per viewport |
| `position_smoothing_enabled`, `position_smoothing_speed` | false, 5.0 | Built-in follow smoothing |
| `drag_horizontal_enabled`, `drag_vertical_enabled` | false | Camera moves only when the target leaves the drag margins |
| `drag_left_margin` etc. | 0.2 | Screen fraction; 1.0 means move only at the edge |
| `limit_left/right/top/bottom` | very large | World pixels, not tiles |
| `limit_smoothed` | false | Smooth stop at limits; needs position smoothing |
| `offset` | (0, 0) | View offset that leaves the node position alone: use it for shake |
| `ignore_rotation` | **true** | The view ignores the node's rotation |
| `zoom` | (1, 1) | `Vector2(2, 2)` zooms in |

- Make the camera a child of the player for the simple case. For custom follow, keep it separate and move it in `_process`.
- Set limits from the level bounds, for example from a TileMapLayer's `get_used_rect()` times the tile size.
- `reset_smoothing()` snaps to the target after a teleport or a level load.

### Custom follow without frame-rate dependence

`lerp(a, b, speed * delta)` converges at different rates at different frame rates. Use exponential decay:

```gdscript
extends Camera2D

@export var target: Node2D
@export var sharpness := 8.0  # higher is snappier

func _process(delta: float) -> void:
	if target == null:
		return
	var t := 1.0 - exp(-sharpness * delta)
	global_position = global_position.lerp(target.global_position, t)
```

Turn `position_smoothing_enabled` off when you smooth by hand, or the two stack.

### Shake

Drive `offset` (and `rotation` for roll) from a trauma value; the curve and decay come from `game-feel`.

- Roll does nothing while `ignore_rotation` is true (the default). Set `ignore_rotation = false` for rotational shake, and note the camera then also follows any parent rotation.
- Reset `offset` and `rotation` to zero when trauma reaches zero.
- Use `FastNoiseLite.get_noise_1d(time)` per axis for smooth shake rather than `randf_range` every frame.
- Reach the active camera with `get_viewport().get_camera_2d()` instead of a hard path.

### Room zones

One `Area2D` per room, on a collision layer only the player's mask hits. On `body_entered`, tween the camera's four limits to the room's rect:

```gdscript
func _on_body_entered(body: Node2D) -> void:
	if not body.is_in_group(&"player"):
		return
	var cam := get_viewport().get_camera_2d()
	var tw := create_tween().set_parallel().set_trans(Tween.TRANS_SINE)
	tw.tween_property(cam, "limit_left", room_rect.position.x, 0.4)
	tw.tween_property(cam, "limit_top", room_rect.position.y, 0.4)
	tw.tween_property(cam, "limit_right", room_rect.end.x, 0.4)
	tw.tween_property(cam, "limit_bottom", room_rect.end.y, 0.4)
```

Limits are `int`; keep `room_rect` a `Rect2i`. Leave a small gap between adjacent zone shapes to avoid double triggers.

## Camera3D

- `fov`, `near`, `far`, `projection` (perspective or orthogonal with `size`), `current`/`make_current()`.
- `keep_aspect` decides whether FOV is horizontal or vertical when the window changes shape.
- `CameraAttributes` (on the camera or WorldEnvironment) carries exposure, DOF and auto-exposure.

### Third person with SpringArm3D

`SpringArm3D` casts toward its tip and pulls the child camera in when geometry is in the way.

```
Player (CharacterBody3D)
└── CameraPivot (Node3D)          # yaw
    └── SpringArm3D               # pitch; spring_length = distance
        └── Camera3D
```

- Set the arm's `collision_mask` to environment layers only, and add the player to `add_excluded_object(player.get_rid())` (or keep the player off that mask) so the arm doesn't collide with its owner.
- Mouse look: accumulate yaw and pitch in `_unhandled_input` from `InputEventMouseMotion.relative`, clamp pitch, apply to pivot and arm. Capture with `Input.mouse_mode = Input.MOUSE_MODE_CAPTURED`.
- If the pivot is `top_level` to decouple from player rotation, move it toward the player in `_process` with the exp-decay smoothing above.

### Orbit

Store yaw, pitch and distance; each frame place the camera at the spherical offset from the target and `look_at(target)`. Clamp pitch below +/-PI/2 so `look_at` never meets a parallel up vector. Zoom on mouse wheel by changing distance within bounds.

### Physics interpolation

With physics interpolation on (4.3+ 2D, 4.4+ 3D; see `godot-physics`):

- A Camera3D that follows a body by hand: set the camera's `physics_interpolation_mode = PHYSICS_INTERPOLATION_MODE_OFF`, keep it in global space (own branch or `top_level = true`), and read `target.get_global_transform_interpolated()` in `_process`, not `global_transform`, or it jitters against the interpolated body. `get_global_transform_interpolated()` is a Node3D method.
- Apply mouse look directly in `_process`/`_unhandled_input` on a non-interpolated camera; mouse motion should not wait for a physics tick.
- After a teleport call `reset_physics_interpolation()` on the moved node.

## Switching cameras

- Hard cut: `next_cam.make_current()`.
- Blend: tween the current camera's `global_position` (plus `zoom` in 2D, `global_rotation` or `fov` in 3D) to the next camera's values, `await tween.finished`, then `next_cam.make_current()`. Set `top_level = true` on the moving camera during the tween so its parent doesn't drag it, and restore after.
- For many cameras with priorities and blends, consider the Phantom Camera addon rather than hand-rolling.

## Split screen

```
HBoxContainer
├── SubViewportContainer (stretch = true)
│   └── SubViewport  # holds the level and P1's camera
└── SubViewportContainer (stretch = true)
    └── SubViewport  # P2's camera only
```

- 2D: both viewports must show the same world. Put the level in the first and share it: `p2_viewport.world_2d = p1_viewport.world_2d`. Each viewport gets its own `Camera2D` with `custom_viewport` set (or placed inside it) that follows its player.
- 3D: a SubViewport renders its parent's `World3D` by default; leave `own_world_3d` off for a shared world. Add one `Camera3D` per viewport.
- `SubViewportContainer.stretch = true` resizes the viewport with the container, so window resizes need no script.
- Audio: enable `audio_listener_enable_2d` or `_3d` on one viewport only, or add an `AudioListener2D`/`AudioListener3D` that follows the chosen player.
- Parallax per screen: see `references/2d.md` (visibility layers plus `canvas_cull_mask`).
- Input per player: route by `InputEvent.device`; see `references/input-map.md`.
- HUD: one CanvasLayer per viewport (inside it) for per-player HUD, or one on the root for a shared overlay.
