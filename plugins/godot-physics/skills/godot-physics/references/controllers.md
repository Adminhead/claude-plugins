# Controller recipes

CharacterBody recipes in GDScript. Each slots into the platformer loop in SKILL.md: gravity, input, velocity, `move_and_slide()`, then read state. Feel targets (how long coyote time should be, why) belong to `game-feel`; this file is the engine code.

## Contents

- Movement loop order
- Coyote time plus jump buffer
- Dash
- Wall slide and wall jump
- One-way platforms
- Moving platforms
- `move_and_collide()` for custom response
- 3D first-person controller
- CharacterBody properties

## Movement loop order

1. Read input (axes, just-pressed actions).
2. Apply gravity and forces scaled by `delta`.
3. Shape velocity (`move_toward`, clamps).
4. `move_and_slide()`.
5. Read results (`is_on_floor()`, landing, wall contact) for state changes and animation.

Keep it in `_physics_process`. Input polled there is tick-aware in 4.x (`is_action_just_pressed` doesn't miss presses between ticks).

## Coyote time plus jump buffer

```gdscript
@export var coyote_time := 0.12
@export var buffer_time := 0.12
var _coyote := 0.0
var _buffer := 0.0

func _physics_process(delta: float) -> void:
    _coyote = coyote_time if is_on_floor() else _coyote - delta
    _buffer = buffer_time if Input.is_action_just_pressed("jump") else _buffer - delta

    if not is_on_floor():
        velocity += get_gravity() * delta
    if _buffer > 0.0 and _coyote > 0.0:
        velocity.y = jump_velocity
        _buffer = 0.0
        _coyote = 0.0                          # consume both, or the jump repeats
    if Input.is_action_just_released("jump") and velocity.y < 0.0:
        velocity.y *= 0.5
    # horizontal movement, then:
    move_and_slide()
```

## Dash

Timer-based velocity override with a cooldown and one air dash per airtime (without the limit it chains forever).

```gdscript
@export var dash_speed := 600.0
@export var dash_duration := 0.2
@export var dash_cooldown := 0.5
var _dash_timer := 0.0
var _cooldown := 0.0
var _air_dash_ready := true
var _dash_dir := Vector2.ZERO
var _facing := 1.0

func _physics_process(delta: float) -> void:
    _cooldown = maxf(_cooldown - delta, 0.0)
    if is_on_floor():
        _air_dash_ready = true
    var input := Input.get_vector("move_left", "move_right", "move_up", "move_down")
    if input.x != 0.0:
        _facing = signf(input.x)

    if Input.is_action_just_pressed("dash") and _cooldown == 0.0 \
            and (is_on_floor() or _air_dash_ready):
        _dash_timer = dash_duration
        _cooldown = dash_duration + dash_cooldown
        _air_dash_ready = is_on_floor()
        _dash_dir = input.normalized() if input != Vector2.ZERO else Vector2(_facing, 0.0)

    if _dash_timer > 0.0:
        _dash_timer -= delta
        velocity = _dash_dir * dash_speed       # ignores gravity during the dash
    else:
        if not is_on_floor():
            velocity += get_gravity() * delta
        # normal horizontal movement
    move_and_slide()
```

## Wall slide and wall jump

```gdscript
@export var wall_slide_speed := 80.0
@export var wall_jump_velocity := Vector2(250.0, -350.0)
@export var wall_jump_lock := 0.15             # seconds of reduced air control
var _lock := 0.0

func _physics_process(delta: float) -> void:
    _lock = maxf(_lock - delta, 0.0)
    if not is_on_floor():
        velocity += get_gravity() * delta
        if is_on_wall_only() and velocity.y > wall_slide_speed:
            velocity.y = wall_slide_speed       # slow fall while touching a wall

    if Input.is_action_just_pressed("jump"):
        if is_on_floor():
            velocity.y = jump_velocity
        elif is_on_wall_only():
            var n := get_wall_normal()
            velocity = Vector2(n.x * wall_jump_velocity.x, wall_jump_velocity.y)
            _lock = wall_jump_lock

    var dir := Input.get_axis("move_left", "move_right")
    var control := 0.2 if _lock > 0.0 else 1.0  # don't let input cancel the kick at once
    velocity.x = move_toward(velocity.x, dir * speed, accel * control * delta)
    move_and_slide()
```

## One-way platforms

Enable `one_way_collision` on the platform's `CollisionShape2D` or `CollisionPolygon2D`. By default the body passes from below (the shape's local down to up). 4.7+: `one_way_collision_direction` (default `Vector2(0, 1)`) sets another direction, for example sideways one-way walls. `one_way_collision_margin` thickens the edge for fast bodies.

Drop through on demand: put one-way platforms on their own layer and clear that bit from the player's mask (`set_collision_mask_value(n, false)`) for a few ticks, then restore it once the player is below.

There is no built-in one-way collision for 3D shapes; use an `Area3D` that toggles the collision mask.

## Moving platforms

Use `AnimatableBody2D/3D` driven by an `AnimationPlayer`, a Tween or code. Keep `sync_to_physics = true` (default) so it moves in step with the physics tick.

```gdscript
extends AnimatableBody2D

@export var travel := Vector2(0, -200)
@export var duration := 2.0

func _ready() -> void:
    var start := position
    var t := create_tween().set_loops().set_process_mode(Tween.TWEEN_PROCESS_PHYSICS)
    t.tween_property(self, "position", start + travel, duration)
    t.tween_property(self, "position", start, duration)
```

A `CharacterBody` standing on it inherits its motion through `move_and_slide()`; `platform_on_leave` decides whether the platform's velocity is kept on jump-off.

## `move_and_collide()` for custom response

Use it when sliding is wrong (bouncing projectiles, pinball). Here you do scale by `delta`.

```gdscript
func _physics_process(delta: float) -> void:
    var hit := move_and_collide(velocity * delta)
    if hit:
        velocity = velocity.bounce(hit.get_normal())
```

`KinematicCollision2D/3D` exposes `get_normal()`, `get_collider()`, `get_position()`, `get_remainder()`, `get_travel()`. `test_move(transform, motion)` checks without moving.

## 3D first-person controller

```gdscript
extends CharacterBody3D

@export var move_speed := 5.0
@export var accel := 40.0
@export var jump_velocity := 4.5
@export var mouse_sensitivity := 0.002
@onready var head: Node3D = $Head             # Camera3D lives under Head

func _ready() -> void:
    Input.mouse_mode = Input.MOUSE_MODE_CAPTURED

func _unhandled_input(event: InputEvent) -> void:
    if event is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
        rotate_y(-event.relative.x * mouse_sensitivity)          # yaw on the body
        head.rotate_x(-event.relative.y * mouse_sensitivity)     # pitch on the head
        head.rotation.x = clampf(head.rotation.x, -PI / 2.0, PI / 2.0)
    elif event.is_action_pressed("ui_cancel"):
        Input.mouse_mode = Input.MOUSE_MODE_VISIBLE

func _physics_process(delta: float) -> void:
    if not is_on_floor():
        velocity += get_gravity() * delta
    if Input.is_action_just_pressed("jump") and is_on_floor():
        velocity.y = jump_velocity
    var input := Input.get_vector("move_left", "move_right", "move_forward", "move_back")
    var dir := (transform.basis * Vector3(input.x, 0.0, input.y)).normalized()
    var horizontal := Vector3(velocity.x, 0.0, velocity.z)
    horizontal = horizontal.move_toward(dir * move_speed, accel * delta)  # delta-scaled
    velocity.x = horizontal.x
    velocity.z = horizontal.z
    move_and_slide()
```

Mouse look runs in `_unhandled_input`, so with physics interpolation on, rotation is applied outside the tick; that's acceptable for the camera, but keep translation in `_physics_process`.

## CharacterBody properties

| Property | Default | Use |
|---|---|---|
| `up_direction` | `UP` | defines floor, wall, ceiling |
| `motion_mode` | grounded | `MOTION_MODE_FLOATING` for top-down and space games |
| `floor_max_angle` | 45 degrees (radians in code) | steepest walkable slope |
| `floor_snap_length` | 1.0 | sticks to downward slopes and steps |
| `floor_stop_on_slope` | true | no idle sliding |
| `floor_constant_speed` | false | same speed up and down slopes |
| `floor_block_on_wall` | true | stops the body walking up walls; it does not fix sticking to walls |
| `slide_on_ceiling` | true | slide or stop on ceiling hits |
| `max_slides` | 4 (2D), 6 (3D) | iterations per call |
| `platform_floor_layers` | all | which platforms carry the body |
| `safe_margin` | 0.08 (2D), 0.001 (3D) | raise slightly if the body snags or jitters on seams |
