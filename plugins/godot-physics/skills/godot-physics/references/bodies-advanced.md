# Bodies, joints, ragdolls, soft bodies and troubleshooting

## Contents

- RigidBody recipes
- Area overrides
- Collision shapes and cost
- Joints
- Ragdolls
- SoftBody3D
- Jolt details
- Troubleshooting table

## RigidBody recipes

| Call | Effect |
|---|---|
| `apply_central_impulse(v)` | instant velocity change (knockback, jump) |
| `apply_impulse(v, offset)` | instant change at an offset, adds spin (bullet hit) |
| `apply_central_force(v)` / `apply_force(v, offset)` | continuous; call every tick (thrusters, wind) |
| `apply_torque(t)` / `apply_torque_impulse(t)` | continuous or instant spin |
| `constant_force` / `constant_torque` | forces that persist without per-tick calls |

Steering or teleporting inside the solver:

```gdscript
extends RigidBody3D

@export var max_speed := 12.0
var _teleport_to: Variant = null

func teleport(t: Transform3D) -> void:
    _teleport_to = t

func _integrate_forces(state: PhysicsDirectBodyState3D) -> void:
    state.linear_velocity = state.linear_velocity.limit_length(max_speed)
    if _teleport_to != null:
        state.transform = _teleport_to
        state.linear_velocity = Vector3.ZERO
        state.angular_velocity = Vector3.ZERO
        _teleport_to = null
```

Turning toward a target without `look_at()`: set `state.angular_velocity` from `forward.cross(to_target)`, scaled by the angle and divided by `state.step`.

- `freeze = true` with `freeze_mode = FREEZE_MODE_STATIC` (acts as static) or `FREEZE_MODE_KINEMATIC` (code-moved, pushes others).
- `PhysicsMaterial`: `friction` (default 1.0), `bounce` (0.0), `rough` (use max friction), `absorbent` (subtract bounce).
- `can_sleep = false` only when `_integrate_forces` must run every tick; sleeping saves CPU.
- `center_of_mass_mode = CENTER_OF_MASS_MODE_CUSTOM` to lower the center of mass of vehicles.
- `lock_rotation = true` for upright rigid characters.

## Area overrides

An `Area` can replace or add to gravity and damping inside it. Overlapping areas are processed by `priority`, highest first.

| `gravity_space_override` | Behavior |
|---|---|
| `SPACE_OVERRIDE_DISABLED` | no override |
| `SPACE_OVERRIDE_COMBINE` | add to the running total, keep processing |
| `SPACE_OVERRIDE_COMBINE_REPLACE` | add, then stop processing lower areas |
| `SPACE_OVERRIDE_REPLACE` | replace the total, stop processing |
| `SPACE_OVERRIDE_REPLACE_COMBINE` | replace the total, keep processing |

```gdscript
extends Area2D                                  # planet or black hole

func _ready() -> void:
    gravity_space_override = Area2D.SPACE_OVERRIDE_COMBINE
    gravity_point = true
    gravity_point_center = Vector2.ZERO          # relative to the area
    gravity = 500.0
```

Zero-G: `SPACE_OVERRIDE_REPLACE` with `gravity = 0.0`. Water: `linear_damp_space_override` and `linear_damp`. Bodies pick these up through `get_gravity()`. Areas can also redirect audio to a bus (`audio_bus_override`); since 4.7 `AudioStreamPlayer.area_mask` defaults to 0, so set it for bus overrides to apply.

## Collision shapes and cost

| Shape | Bodies | Cost |
|---|---|---|
| Primitives (box, sphere, capsule, cylinder) | all | cheapest; prefer for dynamic bodies |
| `ConvexPolygonShape*` | all | fast; no holes or concave parts |
| `ConcavePolygonShape*` (trimesh) | static only | slowest; level geometry |
| `WorldBoundaryShape*` | static | infinite plane or line |
| `SeparationRayShape*` | character | step-up and snapping helpers |

Generate shapes: `MeshInstance3D` > Mesh menu > Create Collision Shape (single or multiple convex, trimesh). 2D: `Sprite2D` > Create CollisionPolygon2D Sibling. `CylinderShape3D` is unreliable under Godot Physics; use a capsule or switch to Jolt. Keep shape nodes untransformed where possible and as direct children of the body.

`TileMapLayer` merges tile collision into quadrants (`physics_quadrant_size`, default 16) since 4.5, which removes most seam bumps.

## Joints

3D: `PinJoint3D`, `HingeJoint3D`, `SliderJoint3D`, `ConeTwistJoint3D`, `Generic6DOFJoint3D`. 2D: `PinJoint2D`, `GrooveJoint2D`, `DampedSpringJoint2D`. Set `node_a` and `node_b` to the bodies; enable `exclude_nodes_from_collision` (default true) so linked bodies don't fight. One-body joints and soft limits behave differently under Jolt (see SKILL.md).

## Ragdolls

1. Select the `Skeleton3D` > Skeleton menu > Create Physical Skeleton. It adds a `PhysicalBoneSimulator3D` with `PhysicalBone3D` children.
2. Delete bones that don't need simulation (roots, twist and helper bones); each costs a body.
3. Set each `PhysicalBone3D.joint_type`: cone for shoulders, hips and neck; hinge with angular limits for elbows and knees. The default pin joint makes the body crumple. Adjust joints before shapes; rotating a joint rotates its shape.
4. Put bones on their own collision layer so they don't fight the character capsule, or call `physical_bones_add_collision_exception(capsule_rid)`.

```gdscript
@onready var sim: PhysicalBoneSimulator3D = $Skeleton3D/PhysicalBoneSimulator3D

func die() -> void:
    sim.physical_bones_start_simulation()        # full ragdoll

func limp_arms() -> void:
    sim.physical_bones_start_simulation(["LeftArm", "RightArm"])

func recover() -> void:
    sim.physical_bones_stop_simulation()
```

`influence` (0 to 1) blends animation and simulation.

## SoftBody3D

Cloth, capes, jelly. Jolt is recommended.

- No collision shape child; the mesh is the body. Use a subdivided mesh (a `PlaneMesh` with 5x5 subdivisions for a cape).
- `simulation_precision` of 5 or more stops collapse. `pressure > 0` only on closed meshes.
- Pin vertices in the Attachments section; point the pin's spatial attachment at a `BoneAttachment3D` to hang a cape from a bone. Add the character's body to `parent_collision_ignore`.
- Disable back-face culling on the material.
- 4.5+: `apply_central_impulse()` and `apply_central_force()` spread over all points; call the force every tick.
- 4.7 Jolt: mass default and stiffness changed (see SKILL.md); retune after upgrading.

## Jolt details

- Settings live under Project Settings > Physics > Jolt Physics 3D (queries, simulation, collisions, joints).
- `Joints > World Node` restores the Godot Physics one-body joint convention for old projects.
- `Collisions > Collision Margin Fraction` sets the effective margin.
- Unsupported joint properties: `PinJoint3D` `bias`, `damping`, `impulse_clamp`; `HingeJoint3D` and `ConeTwistJoint3D` `bias`, `softness`, `relaxation`; slider and 6DOF limit softness, restitution and damping.
- The standalone Jolt GDExtension is in maintenance mode; prefer the built-in module.

## Troubleshooting table

| Symptom | Causes and fixes |
|---|---|
| Fast objects pass through walls | Enable CCD (3D bool, 2D enum); thicken static colliders; raycast the motion; raise ticks to 120 |
| Stacks wobble or explode | Raise the tick rate; use Jolt in 3D; reduce mass ratios between touching bodies |
| Scaled body doesn't collide properly | Remove node scale; size the shape; `duplicate()` a shared shape before resizing |
| Bumps on tile seams | 4.5+ quadrant merge; earlier: merged polygons or a capsule collider |
| `CylinderShape3D` jitters | Use Jolt, or swap for a capsule |
| Frame rate collapses under load ("spiral of death") | Physics can't keep up, so each frame runs more catch-up ticks (capped by `physics/common/max_physics_steps_per_frame`, default 8). Cut body count or shape cost, or lower the tick rate |
| Wobble far from origin | Float precision past a few km: origin shifting or a double-precision build |
| Area never fires | `monitoring` off, mask mismatch, or the other object has no shape |
| Contact signals never fire on a RigidBody | `contact_monitor` off or `max_contacts_reported = 0` |
