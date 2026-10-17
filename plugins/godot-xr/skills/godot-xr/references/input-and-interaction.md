# Input and interaction

Checked against the Godot 4.7 docs (XR action map tutorial, `XRController3D` and `XRNode3D` class reference, engine default action map), 2026-10-17.

## Contents

- The action map
- Reading controller input
- Locomotion and snap turn
- Grabbing
- Pointer UI on a quad
- Haptics

## The action map

OpenXR input goes through an action map (`res://openxr_action_map.tres`), edited in the **OpenXR Action Map** bottom panel. Godot creates a default map if none exists. The default binds every known input on every supported controller one to one; the docs call it a migration aid, not a model. For a real game, make one action set with actions named for what they do (`grab`, `shoot`, `move`, `menu`) and bind them per interaction profile (Touch, Index, Pico, the hand interaction profile).

Action types:

| Type | Read with | Signal on `XRController3D` |
|---|---|---|
| Bool | `is_button_pressed(name)` | `button_pressed(name)`, `button_released(name)` |
| Float | `get_float(name)` | `input_float_changed(name, value)` |
| Vector2 | `get_vector2(name)` | `input_vector2_changed(name, value)` |
| Pose | sets the node's transform via its `pose` property (`aim`, `grip`, `palm`) | |
| Haptic | `trigger_haptic_pulse(...)` | |

Default action names, if the project keeps the default map: `trigger` (float), `trigger_click`, `trigger_touch`, `grip` (float), `grip_click`, `grip_force`, `primary` (Vector2: the thumbstick), `primary_click`, `primary_touch`, `secondary` (Vector2: trackpad or second stick), `secondary_click`, `secondary_touch`, `ax_button`, `ax_touch`, `by_button`, `by_touch`, `menu_button`, `select_button`, `haptic`, and the poses `aim_pose`, `grip_pose`, `palm_pose`, `default_pose`. There is no `primary_x`/`primary_y`; read the stick with `get_vector2("primary")`.

Runtimes apply their own thresholds when a float input is bound to a bool action, and not all are sensible. Bind triggers and grips as Float and threshold them yourself; A/B/X/Y are fine as Bool.

## Reading controller input

```gdscript
extends XRController3D

const GRIP_ON := 0.7
const GRIP_OFF := 0.5
var gripping := false

func _ready() -> void:
	button_pressed.connect(func(action: String) -> void:
		if action == "menu_button":
			get_tree().call_group("menu", "toggle"))

func _physics_process(_delta: float) -> void:
	var grip := get_float("grip")
	# Hysteresis so the grab doesn't chatter around one threshold.
	if not gripping and grip > GRIP_ON:
		gripping = true
		grab()
	elif gripping and grip < GRIP_OFF:
		gripping = false
		release()
```

`get_tracker_hand()` tells left from right; `get_has_tracking_data()` and `get_is_active()` report tracking loss (hide the hand mesh when tracking drops).

## Locomotion and snap turn

Move the origin, in the direction the head faces, flattened to the floor. For collision with walls, carry the origin on a `CharacterBody3D` (or use XR Tools' player body) instead of setting `global_position` directly.

```gdscript
extends XROrigin3D

@export var speed := 2.0
@export var snap_degrees := 30.0
@export var deadzone := 0.2

@onready var camera: XRCamera3D = $XRCamera3D
@onready var left: XRController3D = $LeftHand
@onready var right: XRController3D = $RightHand
var _turn_ready := true

func _physics_process(delta: float) -> void:
	var move := left.get_vector2("primary")
	if move.length() > deadzone:
		var forward := -camera.global_basis.z
		forward.y = 0.0
		var side := camera.global_basis.x
		side.y = 0.0
		global_position += (forward.normalized() * move.y + side.normalized() * move.x) * speed * delta

	var turn := right.get_vector2("primary").x
	if _turn_ready and absf(turn) > 0.6:
		_snap_turn(-signf(turn) * deg_to_rad(snap_degrees))
		_turn_ready = false
	elif absf(turn) < 0.2:
		_turn_ready = true

# Rotate around the player's head, not the origin, so the view doesn't slide.
func _snap_turn(angle: float) -> void:
	var head_before := camera.global_position
	rotate_y(angle)
	global_position += head_before - camera.global_position
```

Room-scale players walk away from the origin; when a body follows the player, move the origin back under the camera each frame (the "room scale" tutorial in the Godot docs covers the pattern).

## Grabbing

`XRController3D` is not a physics body, so a `Joint3D` between it and a `RigidBody3D` does nothing. The simple pattern: freeze the body while held and carry it as a child of the controller, then hand it the controller's velocity on release.

```gdscript
extends XRController3D

@onready var grab_area: Area3D = $GrabArea  # small sphere at the palm
var _held: RigidBody3D
var _held_parent: Node

func grab() -> void:
	for body in grab_area.get_overlapping_bodies():
		if body is RigidBody3D:
			_held = body
			_held_parent = body.get_parent()
			_held.freeze_mode = RigidBody3D.FREEZE_MODE_KINEMATIC
			_held.freeze = true
			_held.reparent(self)  # keeps the global transform
			return

func release() -> void:
	if _held == null:
		return
	_held.reparent(_held_parent)
	_held.freeze = false
	var pose := get_pose()
	if pose:
		# XRPose velocities are in tracking space; rotate them into the world.
		var origin_basis := (get_parent() as Node3D).global_basis
		_held.linear_velocity = origin_basis * pose.linear_velocity
		_held.angular_velocity = origin_basis * pose.angular_velocity
	_held = null
```

For weighty objects that should collide while held, drive the body toward the hand with forces (or `move_and_collide` on an `AnimatableBody3D`) instead of reparenting; XR Tools' pickable objects implement both styles.

## Pointer UI on a quad

Render 2D UI into a `SubViewport`, show it on a `QuadMesh`, and forward pointer hits as mouse events.

```
UIPanel (StaticBody3D)          # collision layer for the pointer ray
  MeshInstance3D (QuadMesh size 1.0 x 0.75; unshaded material, albedo = SubViewport texture)
  CollisionShape3D (BoxShape3D matching the quad, thin in Z)
  SubViewport (1024 x 768, update mode Always, transparent bg if needed)
    Control (the UI scene)
```

```gdscript
# ui_panel.gd on UIPanel
extends StaticBody3D

@export var quad_size := Vector2(1.0, 0.75)
@onready var viewport: SubViewport = $SubViewport
var _last_pos := Vector2.ZERO

func pointer_move(global_hit: Vector3) -> void:
	_last_pos = _to_viewport(global_hit)
	var e := InputEventMouseMotion.new()
	e.position = _last_pos
	e.global_position = _last_pos
	viewport.push_input(e)

func pointer_button(pressed: bool) -> void:
	var e := InputEventMouseButton.new()
	e.button_index = MOUSE_BUTTON_LEFT
	e.pressed = pressed
	e.position = _last_pos
	e.global_position = _last_pos
	viewport.push_input(e)

func _to_viewport(global_hit: Vector3) -> Vector2:
	var local := to_local(global_hit)  # QuadMesh is centred and faces +Z
	var uv := Vector2(local.x / quad_size.x + 0.5, 0.5 - local.y / quad_size.y)
	return uv * Vector2(viewport.size)
```

The controller casts a `RayCast3D` along its aim pose (`pose = aim`), calls `pointer_move` on whatever it hits, and calls `pointer_button` when the trigger crosses its threshold. Draw a thin laser mesh and a hit dot so players can see what they point at. For the sharpest text on Quest, use an `OpenXRCompositionLayerQuad` with the SubViewport as its layer viewport instead of a mesh.

## Haptics

`trigger_haptic_pulse(action_name, frequency, amplitude, duration_sec, delay_sec)` on an `XRController3D`, with the haptic action from the map (`haptic` in the default map). A frequency of `0.0` lets the runtime pick. Keep pulses short (0.05 to 0.1 s) for UI ticks and grabs.
