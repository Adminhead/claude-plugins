# GDScript 2.0

Typing, annotations, the lifecycle, coroutines, lambdas and the Godot 3 to 4 translations. Godot 4.x, checked against 4.7.

## Contents

- Typing
- Annotations
- Lifecycle order
- await and coroutines
- Lambdas, match, statics
- Godot 3 to 4 translations
- Pitfalls

## Typing

```gdscript
class_name Spinner extends Node2D

const MAX_SPEED: float = 400.0
@export var speed: float = 90.0
var targets: Array[Node2D] = []
var stock: Dictionary[StringName, int] = {}   # 4.4+: typed Dictionary

func spin(delta: float) -> void:
    rotation_degrees += speed * delta

func first_alive() -> Node2D:
    for t: Node2D in targets:                  # typed loop variable
        if t.visible:
            return t
    return null
```

- Check with `is`, then cast with `as` (`as` returns `null` on mismatch, silently).
- A typed array cannot hold a different element type, even a subtype: `var a: Array[Node] = some_array_of_node2d` fails. Convert with `var a: Array[Node] = []; a.assign(other)`. Untyped `Array` is accepted but unsafe.
- Typed-array methods such as `front()` and `back()` still return `Variant`; type the receiving variable.
- 4.5+: variadic functions `func log_all(prefix: String, ...args: Array) -> void:` (one rest parameter, last, untyped `Array`, no default). Spread syntax does not exist; use `callv()`.
- 4.5+: `@abstract` on a class or method. An abstract class cannot be instantiated and concrete subclasses must implement every abstract method. It goes before `class_name`/`extends`.
- 4.7+: an override of a method with a typed return inherits that return type, so an override with no `return` statement is an error. Add an explicit `return`.
- Turn on `debug/gdscript/warnings/untyped_declaration`, `unsafe_cast` and `unsafe_call_argument` (Project Settings > Debug > GDScript) for strict projects; set them to Error in teams.
- Prefer `ClassDB.class_exists(&"Sprite2D")` to check engine classes.

## Annotations

| Annotation | Use |
| --- | --- |
| `@export`, `@export_range(0, 100, 1, "or_greater")`, `@export_enum("A", "B")`, `@export_flags(...)`, `@export_multiline`, `@export_node_path("Camera2D")` | Inspector fields |
| `@export_file("*.json")` | 4.4+: stores a `uid://` path when set in the Inspector |
| `@export_file_path` | 4.5+: keeps a plain `res://` path |
| `@export_group("Movement")`, `@export_subgroup`, `@export_category` | Inspector headings. A group runs until the next group; end it with `@export_group("")` |
| `@export_tool_button("Bake")` | 4.4+: a button in the Inspector for a `@tool` script, bound to a Callable property |
| `@onready` | Assign just before `_ready()` runs |
| `@tool` | Run in the editor; see `references/tool-scripts.md` |
| `@icon("res://icon.svg")`, `@warning_ignore("unused_variable")`, `@static_unload` | Icon, silence one warning, let static vars unload |
| `@rpc(...)` | Network methods; see `godot-multiplayer` |

Property accessors:

```gdscript
@export var health: int = 100:
    set(value):
        health = clampi(value, 0, max_health)
        health_changed.emit(health)
```

The initial value assignment skips the setter; assignments in `_init()`, from the Inspector or at runtime call it. Inside its own setter, assigning the property writes the backing value without recursing.

## Lifecycle order

1. `_init()`: object constructed. No tree, no children, `@onready` not set.
2. `_enter_tree()`: parent first, then children.
3. `_ready()`: children first, then the parent. Runs once per node unless `request_ready()` is called. `@onready` vars are set just before.
4. `_process(delta)` every frame; `_physics_process(delta)` every physics tick (`physics/common/physics_ticks_per_second`, default 60).
5. `_exit_tree()` on removal; `NOTIFICATION_PREDELETE` before freeing.

- A parent's `_ready()` can safely configure its children; a child's `_ready()` cannot rely on its parent being ready.
- Exported values are applied after `_init()`. `var hp: int = max_hp` at declaration reads the script default, not the Inspector value; initialize from exports in `_ready()`.
- A subclass that overrides `_ready()` replaces the parent's; call `super()` to run it.

## await and coroutines

```gdscript
func death() -> void:
    $AnimationPlayer.play(&"die")
    await $AnimationPlayer.animation_finished
    await get_tree().create_timer(0.5).timeout
    queue_free()
```

- A function containing `await` is a coroutine; callers that need its result must `await` it too.
- `await` in `_ready()` returns control early: the node reports ready and the parent's `_ready()` runs before the rest of setup. Finish everything others read before the first `await`, or emit an `initialized` signal and keep an `is_initialized` flag.
- Awaiting a signal that already fired, or never fires, suspends forever. Check the condition first; race slow signals against a timer (pattern in `references/signals-groups.md`). There is no built-in `Signal.any()`.
- If the node running the coroutine is freed, the coroutine is dropped silently: code after `await` never runs, so `is_instance_valid(self)` guards nothing. Other objects may be freed while you wait: recheck them with `is_instance_valid()`.
- `call_deferred()` runs at the end of the current frame's idle time, not on the next frame.

## Lambdas, match, statics

- Lambdas capture locals by value when created. Reassigning a captured local inside the lambda changes only the lambda's copy (`CONFUSABLE_CAPTURE_REASSIGNMENT` warning). Share state through a member, `Array`, `Dictionary` or object.
- A lambda connected to a signal keeps its captures alive; disconnect it in `_exit_tree()` or connect a bound method instead.
- `match` supports literals, `var` bindings, arrays (`[1, ..]`, `["move", var dir]`) and dictionaries (`{"type": "heal", "amount": var n}`); add a `_:` branch.
- Static vars live for the whole engine run, not the scene: a scene reload does not reset them.
- Never `obj.call(name)` with a name from a save file, network or mod without checking it against an allowlist.
- 4.7+: writing an element of a packed-array property (`obj.points[0] = v`) no longer calls the property's setter. Copy, modify, reassign. The `CONFUSABLE_TEMPORARY_MODIFICATION` warning flags writes to a temporary copy.

## Godot 3 to 4 translations

| Godot 3 | Godot 4 |
| --- | --- |
| `yield(obj, "sig")` | `await obj.sig` |
| `export var`, `onready var`, `tool` | `@export var`, `@onready var`, `@tool` |
| `scene.instance()` | `scene.instantiate()` |
| `connect("hit", self, "_on_hit")` | `hit.connect(_on_hit)` |
| `emit_signal("died")` | `died.emit()` (string form still works) |
| `change_scene(path)` | `change_scene_to_file(path)` / `change_scene_to_packed(scene)` |
| `File`, `Directory` | `FileAccess.open()`, `DirAccess.open()` (static constructors) |
| `PoolVector2Array`, `Reference` | `PackedVector2Array`, `RefCounted` |
| `OS.get_ticks_msec()`, `OS.window_size` | `Time.get_ticks_msec()`, `DisplayServer.window_get_size()` |
| `rand_range`, `stepify`, `deg2rad`, `linear2db` | `randf_range`, `snapped`, `deg_to_rad`, `linear_to_db` |
| `velocity = move_and_slide(velocity, Vector2.UP)` | set `velocity`, `up_direction`; call `move_and_slide()` |
| `KinematicBody2D`, `Spatial`, `Sprite`, `Position2D`, `VisibilityNotifier2D` | `CharacterBody2D`, `Node3D`, `Sprite2D`, `Marker2D`, `VisibleOnScreenNotifier2D` |
| `Tween` node | `create_tween()` |
| `remote`, `master`, `puppet`, `is_network_master()` | `@rpc(...)`, `is_multiplayer_authority()` |
| `TileMap` (4.0-4.2) | 4.3+: one `TileMapLayer` node per layer |

## Pitfalls

- Integer division truncates: `5 / 2 == 2`. Use `5.0 / 2` or `float()`.
- `$A/B/C/D` paths break on any rename; use `%UniqueName` or an exported `NodePath`/node reference.
- Uncached `get_node()` in `_process()`; cache with `@onready`.
- `await` after `queue_free()` on self: the coroutine is dropped.
- `call_deferred` sprinkled everywhere hides ordering bugs; defer only tree and physics-state changes made during physics callbacks or signals.
- Setting `position` on a CharacterBody each frame skips collision; set `velocity` and call `move_and_slide()` (see `godot-physics`).
- Use `StringName` literals (`&"idle"`) for animation names, groups and dictionary keys on hot paths.
