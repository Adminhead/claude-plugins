# Raycasts and space queries

All space-state calls must run inside `_physics_process` (the space is locked otherwise). Use the `2D`/`3D` variant that matches the world.

## RayCast nodes (polled every tick)

```gdscript
@onready var ray: RayCast2D = $RayCast2D       # set target_position in the editor

func _physics_process(_delta: float) -> void:
    if ray.is_colliding():
        var hit := ray.get_collider()
        var point := ray.get_collision_point()
        var normal := ray.get_collision_normal()
```

- `target_position` is relative to the node; `enabled` must be true.
- `collide_with_areas` (default false) and `collide_with_bodies` choose what it sees.
- `add_exception(node)` / `add_exception_rid(rid)` skip colliders; `exclude_parent` (default true) skips the parent body.
- After moving or rotating the ray inside the same tick, call `force_raycast_update()` before reading.
- `ShapeCast2D/3D` is the swept-shape equivalent (`get_collision_count()`, `get_collider(i)`).

## `intersect_ray`

```gdscript
var space := get_world_3d().direct_space_state
var q := PhysicsRayQueryParameters3D.create(from, to)
q.collision_mask = 0b0010                       # layer 2
q.exclude = [get_rid()]                         # Array[RID]
q.collide_with_areas = false
var hit := space.intersect_ray(q)
if hit:
    print(hit.collider, hit.position, hit.normal)
```

Result keys: `position`, `normal`, `collider`, `collider_id`, `rid`, `shape`, plus `face_index` in 3D (`-1` under Jolt unless the face-index setting is on). An empty dictionary means no hit.

## Shape and point queries

```gdscript
var shape := SphereShape3D.new()
shape.radius = 2.0
var sq := PhysicsShapeQueryParameters3D.new()
sq.shape = shape
sq.transform = Transform3D(Basis(), global_position)
sq.collision_mask = 0b0100
var overlaps := space.intersect_shape(sq, 32)   # max results; each {collider, rid, shape, collider_id}
```

| Method | Answers |
|---|---|
| `intersect_point(params)` | what overlaps this point (2D and 3D) |
| `intersect_shape(params, max)` | what overlaps this shape |
| `cast_motion(params)` | how far the shape can move along `params.motion` (safe and unsafe fractions) |
| `collide_shape(params, max)` | contact points for the shape |
| `get_rest_info(params)` | the closest contact (point, normal, collider) |

Explosion damage: `intersect_shape` with a sphere, then confirm line of sight with `intersect_ray` per target.

## 3D mouse picking

Store the click in `_unhandled_input`, query in `_physics_process`:

```gdscript
const RAY_LENGTH := 1000.0
var _pending_click := false
var _click_pos := Vector2.ZERO

func _unhandled_input(event: InputEvent) -> void:
    if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
        _click_pos = event.position
        _pending_click = true

func _physics_process(_delta: float) -> void:
    if not _pending_click:
        return
    _pending_click = false
    var cam := get_viewport().get_camera_3d()
    var from := cam.project_ray_origin(_click_pos)
    var to := from + cam.project_ray_normal(_click_pos) * RAY_LENGTH
    var q := PhysicsRayQueryParameters3D.create(from, to)
    q.collide_with_areas = true
    var hit := get_world_3d().direct_space_state.intersect_ray(q)
    if hit:
        print("clicked ", hit.collider.name)
```

For simple clicks on bodies, `CollisionObject3D.input_event` with `input_ray_pickable = true` avoids the manual query.

## Layer bits

- Code setters are 1-based: `set_collision_mask_value(3, true)` is bit `1 << 2`.
- Raw masks: `collision_mask = (1 << 2) | (1 << 4)` scans layers 3 and 5.
- Inspector picker on your own exports: `@export_flags_2d_physics var scan_layers := 0` (`@export_flags_3d_physics` for 3D).
- Typical naming: Player, Enemy, World, Projectile, Pickup, Trigger. Name them once in Project Settings > Layer Names.
