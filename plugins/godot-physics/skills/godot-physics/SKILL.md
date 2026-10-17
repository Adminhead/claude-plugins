---
name: godot-physics
description: Godot 4 movement and collision in 2D and 3D. CharacterBody controllers and move_and_slide, Rigid/Static/Animatable/Area bodies, collision layers vs masks, raycasts and space queries, physics interpolation, Jolt. Use for "falls through the floor", "jitters", "is_on_floor always false", or a platformer or FPS controller.
license: Apache-2.0 AND MIT
---

# Godot physics

Engine API for bodies, controllers, collisions and queries. Written for Godot 4.x, checked against 4.7. Version-gated facts are tagged inline (`4.6+`); per-minor changes live in the `godot` skill's version notes.

Not for: why a jump feels floaty, coyote time and buffering as design, camera feel (`game-feel`); fixed versus variable timestep as architecture (`game-architecture`); tile collision painting and general scene work (`godot`); `.gdshader` (`godot-shaders`); networked physics (`godot-multiplayer`); C# syntax (`godot-csharp`).

## Orient first

1. Read the version from `config/features=PackedStringArray("4.x", ...)` in `project.godot` and follow that version, not the newest.
2. For 3D, read `[physics] 3d/physics_engine`. Projects created in 4.6+ default to `"Jolt Physics"`; older projects keep Godot Physics until someone switches. 2D always uses Godot's 2D engine. The API is the same; joints, margins, ray face indices and kinematic contacts differ (see Jolt below).
3. Check `physics/common/physics_interpolation` and `physics/common/physics_ticks_per_second` (default 60) before chasing jitter.

## Pick the body

| Node | Moved by | Use for |
|---|---|---|
| `CharacterBody2D/3D` | your code: `velocity` + `move_and_slide()` | players, enemies, NPCs |
| `RigidBody2D/3D` | the solver: forces, impulses, `_integrate_forces` | props, debris, balls, ragdoll parts |
| `StaticBody2D/3D` | never (can impart `constant_linear_velocity`, e.g. conveyors) | walls, floors |
| `AnimatableBody2D/3D` | code, Tween or AnimationPlayer; pushes bodies | moving platforms, doors, lifts |
| `Area2D/3D` | code; detects only, no collision response | triggers, hit/hurtboxes, water, gravity zones |

Every collision object needs a `CollisionShape*` or `CollisionPolygon*` as a direct child. Size shapes through their own parameters (radius, size, height); never scale a body or shape node.

## Core rules

- **Controllers:** set `velocity`, then call `move_and_slide()` with no arguments, inside `_physics_process(delta)`. Don't multiply `velocity` by `delta` (the call already does); do scale accelerations and gravity by `delta`. Read `is_on_floor()`, `is_on_wall()`, `get_wall_normal()`, `get_slide_collision(i)` after the call.
- **Gravity:** `get_gravity()` (4.3+) returns the gravity at the body, including Area overrides. On older projects read `ProjectSettings.get_setting("physics/2d/default_gravity")` once.
- **Layers vs masks:** `collision_layer` is what I am; `collision_mask` is what I scan. A detects B only if B's layer is in A's mask, so detection can be one-way. Name layers in Project Settings > Layer Names; set bits with `set_collision_layer_value(n, true)` (1-based).
- **RigidBody:** move it with `apply_central_impulse`, `apply_force`, `apply_torque`, `linear_velocity`, or inside `_integrate_forces(state)`. Never set `position` or call `look_at()` on it each frame. `_integrate_forces` doesn't run while the body sleeps.
- **Contact signals on a RigidBody** need `contact_monitor = true` and `max_contacts_reported > 0`.
- **Area signals** need `monitoring = true` on the detector and the target's layer in its mask. `body_entered` for bodies, `area_entered` for Area-to-Area (hitbox vs hurtbox).
- **Queries:** `direct_space_state` is only valid inside `_physics_process`. `RayCast*` nodes update once per physics tick; call `force_raycast_update()` after moving one in the same tick.

## Patterns

Platformer controller (2D). Coyote time, buffering, dash and wall jump are in [references/controllers.md](references/controllers.md).

```gdscript
extends CharacterBody2D

@export var speed := 200.0
@export var accel := 1500.0
@export var friction := 1800.0
@export var jump_velocity := -400.0

func _physics_process(delta: float) -> void:
    if not is_on_floor():
        velocity += get_gravity() * delta
    if Input.is_action_just_pressed("jump") and is_on_floor():
        velocity.y = jump_velocity
    if Input.is_action_just_released("jump") and velocity.y < 0.0:
        velocity.y *= 0.5                       # variable jump height
    var dir := Input.get_axis("move_left", "move_right")
    var target := dir * speed
    var rate := accel if dir != 0.0 else friction
    velocity.x = move_toward(velocity.x, target, rate * delta)
    move_and_slide()
```

Top-down: set `motion_mode = MOTION_MODE_FLOATING` (no floor or walls), then `velocity = Input.get_vector("left", "right", "up", "down") * speed` and `move_and_slide()`.

One-shot ray from code:

```gdscript
func ground_below(from: Vector2) -> Dictionary:
    var space := get_world_2d().direct_space_state
    var q := PhysicsRayQueryParameters2D.create(from, from + Vector2(0, 64))
    q.collision_mask = 1 << 0                  # layer 1 only
    q.exclude = [get_rid()]                    # Array[RID], not nodes
    return space.intersect_ray(q)              # {} on miss; else position, normal, collider, ...
```

Shape queries, mouse picking, `cast_motion` and RayCast node details: [references/queries.md](references/queries.md).

## Physics interpolation (2D 4.3+, 3D 4.4+)

Turns "staircase" motion into smooth motion when the tick rate and frame rate differ. Prefer it over hand-written smoothing.

1. Enable Project Settings > Physics > Common > Physics Interpolation.
2. Move everything that moves in `_physics_process`, including parents, Tweens and AnimationPlayers that drive physics objects (set them to physics process mode).
3. Call `reset_physics_interpolation()` after the first placement and after any teleport, or the object streaks across the screen.
4. Cameras: put the camera on its own branch or set `top_level = true`, update it in `_process`, and follow `target.get_global_transform_interpolated()`. Use that call only for one or two such nodes per frame.
5. Opt nodes out with `physics_interpolation_mode = PHYSICS_INTERPOLATION_MODE_OFF`.
6. To test, set Physics Ticks per Second to 10 temporarily; anything moved outside the tick will stutter visibly.

`SoftBody3D` isn't interpolated; raise the tick rate if it looks choppy. 4.5 moved 3D interpolation to the SceneTree (no API change).

## Jolt (3D)

Built in since 4.4, default for new projects since 4.6 (`physics/3d/physics_engine`). Better stacking, reliable `CylinderShape3D`, better soft bodies. Differences that break ported projects:

- `face_index` in ray results is `-1` unless Physics > Jolt Physics 3D > Queries > Enable Ray Cast Face Index is on (costs memory on `ConcavePolygonShape3D`).
- A joint with one body: whichever slot you fill, Godot Physics treats the body as `node_a`, Jolt as `node_b` with `node_a` as the world, so limits invert after switching. Flip the limits, or set Physics > Jolt Physics 3D > Joints > World Node for an old project.
- Joint soft-limit properties (`bias`, `softness`, `relaxation`, limit damping and restitution) are unsupported; Godot warns when they're non-default.
- A frozen kinematic `RigidBody3D` reports no contacts with static or kinematic bodies unless Simulation > Generate All Kinematic Contacts is on.
- Shape `margin` is a convex radius: Jolt shrinks the shape, then rounds it back out, so sizes stay true but small shapes get rounded corners and odd normals.
- 4.7 changes under Jolt: `Area3D` now reports `SoftBody3D` overlaps (filter with layers); `WorldBoundaryShape3D.plane.d` sign flipped to match Godot Physics (negate `d` to keep 4.6 behavior); `SoftBody3D` mass defaults to 1 kg for the whole body (was per point), so retune `linear_stiffness` and `damping_coefficient`.

More Jolt detail, joints, ragdolls, soft bodies and Area overrides: [references/bodies-advanced.md](references/bodies-advanced.md).

## Gotchas

- **3.x signatures don't parse:** `move_and_slide(velocity, Vector2.UP)` is gone; set the property and call with no arguments.
- **`is_on_floor()` always false:** wrong `up_direction`, missing or zero-size shape, floor not in the mask, or `move_and_slide()` not called this tick.
- **Falls through the floor:** shape missing or disabled, floor on a layer outside the mask, the body moved with `position +=`, or a fast body tunneling (below).
- **Tunneling:** `RigidBody3D.continuous_cd = true`; on `RigidBody2D` it's an enum (`CCD_MODE_CAST_RAY` or `CCD_MODE_CAST_SHAPE`). For bullets, raycast the frame's motion instead. Raising the tick rate also helps.
- **Slides down slopes while idle:** keep `floor_stop_on_slope = true` and raise `floor_snap_length` (default 1.0) so the body sticks to downward slopes. `floor_max_angle` defaults to 45 degrees.
- **Moving platform doesn't carry the player:** use `AnimatableBody*` (a code-moved `StaticBody` doesn't push reliably); the rider inherits velocity through `platform_floor_layers` and `platform_on_leave`.
- **Jitter with interpolation on:** something moves in `_process`, or a teleport skipped `reset_physics_interpolation()`.
- **Concave shapes** (`ConcavePolygonShape*`) only on static bodies; dynamic bodies use primitives or convex hulls. Shapes on one body never collide with each other.
- **Far from the origin** (several km) precision drops; shift the world origin or use a double-precision build.

## References

- [references/controllers.md](references/controllers.md): read when building or fixing a controller: coyote time, jump buffer, dash, wall jump, one-way and moving platforms, `move_and_collide`, a 3D first-person controller, CharacterBody property table.
- [references/queries.md](references/queries.md): read for RayCast nodes, `intersect_ray`/`intersect_shape`/`cast_motion`, 3D mouse picking, layer bit tricks.
- [references/bodies-advanced.md](references/bodies-advanced.md): read for RigidBody recipes, Area gravity and damping overrides, joints, ragdolls (`PhysicalBoneSimulator3D`), `SoftBody3D`, full Jolt notes and the troubleshooting table.

Adapted from awesome-gamedev-agent-skills (Apache-2.0) and GodotPrompter (MIT); see NOTICE.
