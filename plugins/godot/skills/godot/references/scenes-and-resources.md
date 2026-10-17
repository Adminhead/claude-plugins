# Scenes, nodes and Resources

Scene composition, node choice, instancing, autoloads, ownership, and custom Resources. Godot 4.x, checked against 4.7.

## Contents

- Choosing nodes
- Composing scenes
- Instancing and the tree
- Autoloads
- Building and saving scenes from code
- Custom Resources
- Project layout

## Choosing nodes

| Need | 2D | 3D |
| --- | --- | --- |
| Player or NPC movement | `CharacterBody2D` | `CharacterBody3D` |
| Physics-driven object | `RigidBody2D` | `RigidBody3D` |
| Static geometry | `StaticBody2D` | `StaticBody3D` |
| Moving platform | `AnimatableBody2D` | `AnimatableBody3D` |
| Trigger, pickup, hurtbox | `Area2D` | `Area3D` |
| Image | `Sprite2D`, `AnimatedSprite2D` | `MeshInstance3D`, `Sprite3D` |
| Tiles | `TileMapLayer` (4.3+) | `GridMap` |
| Spawn point | `Marker2D` | `Marker3D` |
| Screen overlay, HUD | `CanvasLayer` + `Control` | same |
| World-space text | `Label` | `Label3D` |
| Timers, keyframes, blending | `Timer`, `AnimationPlayer`, `AnimationTree` | same |
| Pathfinding | `NavigationAgent2D` | `NavigationAgent3D` |

2.5D: `Sprite3D` billboards in a 3D world; an orthographic `Camera3D` for isometric; a `SubViewport` shown in a `TextureRect` for 3D previews inside 2D UI.

## Composing scenes

- One scene, one concept (Player, Enemy, HealthBar, Weapon). If it needs more than two words to name, split it.
- Split when the part is reused, the scene passes roughly 15 nodes or several concerns, the part can be tested alone, or two people edit it. Keep tightly coupled nodes together when a split would need signal plumbing just to say "you were hit".
- Composition by default: an entity is a body plus child component scenes (`HealthComponent`, `Hitbox`, `StateMachine`). See `references/patterns.md`.
- Inherited scene (Scene > New Inherited Scene) only when the variants share the whole node layout and differ in exports or art (Enemy > Orc, Goblin). Base changes propagate to inherited scenes.
- Node hierarchy rules: a `CollisionShape2D/3D` or `CollisionPolygon2D` must be a direct child of its CollisionObject. Group visuals under `Node2D`/`Node3D`; a plain `Node` parent breaks transform inheritance.
- Communication: signals go up, method calls go down, an autoload event bus goes sideways between unrelated scenes. The level scene is the composition root: it wires its children's signals in its `_ready()`.

## Instancing and the tree

```gdscript
const BULLET: PackedScene = preload("res://weapons/bullet.tscn")

func shoot(at: Vector2, dir: Vector2) -> void:
    var b := BULLET.instantiate() as Bullet
    b.global_position = at
    b.direction = dir
    get_tree().current_scene.add_child(b)   # not a child of the moving shooter
```

- `preload` needs a constant path and loads with the script; `load()` takes a runtime path. For big scenes use `ResourceLoader.load_threaded_request()` (see `references/threading.md`).
- The child's `_ready()` and `@onready` vars run only after `add_child()`.
- Node paths: `$Child/Grandchild`, `$"Name With Spaces"`, `%UniqueName` (right-click > Access as Unique Name; works anywhere in the same scene), `get_node_or_null()` for optional nodes. `get_tree().current_scene` is the running main scene; `get_tree().root` is the root `Window`.
- `queue_free()` deletes at the end of the frame; `free()` is immediate. Guard held references with `is_instance_valid()`.
- `reparent(new_parent)` keeps the global transform by default. `move_child(node, index)` reorders draw and process order.
- Adding or removing bodies and shapes during a physics callback or `body_entered` errors with "flushing queries": use `add_child.call_deferred(node)` or `shape.set_deferred(&"disabled", true)`.
- `change_scene_to_file()`/`change_scene_to_packed()` are deferred; code after the call still runs on the old scene. Read new nodes from the new scene's `_ready()`.
- Process order: `process_priority` (lower first), then tree order. Pausing: `get_tree().paused = true` stops nodes whose `process_mode` is `PROCESS_MODE_INHERIT`/`PAUSABLE`; pause menus use `PROCESS_MODE_ALWAYS` or `WHEN_PAUSED`.

## Autoloads

- Register in Project Settings > Globals > Autoload (`[autoload]` in `project.godot`: `Events="*res://autoload/events.gd"`, the `*` makes it a global name). They are added under the root before the main scene, in list order.
- Use them for services and cross-scene state (event bus, audio, save, scene switching), not for per-level nodes. An autoload cannot assume the main scene exists in its `_ready()`.
- A class with static functions often replaces a stateless autoload.
- Don't give an autoload the same name as its script's `class_name`: the names collide.

## Building and saving scenes from code

Every node to save needs `owner` set to the scene root, or `PackedScene.pack()` drops it:

```gdscript
var root := Node2D.new()
var sprite := Sprite2D.new()
root.add_child(sprite)
sprite.owner = root
var packed := PackedScene.new()
packed.pack(root)
ResourceSaver.save(packed, "res://generated/thing.tscn")
```

Run this from an `EditorScript` or a `@tool` script while editing; `res://` is read-only in exported games.

## Custom Resources

```gdscript
class_name ItemData extends Resource

@export var id: StringName
@export var display_name: String
@export var icon: Texture2D
@export_range(1, 999) var max_stack: int = 1
```

- `class_name` makes it appear in New Resource and as an `@export` type. Keep Resources as data; behaviour lives in nodes.
- Use small focused Resources (ItemData, WeaponStats) over one god config. Export typed arrays (`@export var loot: Array[ItemData]`) so the Inspector rejects the wrong type.
- Resources are shared: every node using `sword.tres` gets the same object, and mutating it changes all of them. For per-instance state, `stats = stats.duplicate()` in `_ready()`, or tick Local to Scene (`resource_local_to_scene`) on the sub-resource. There is no `make_unique()` method; "Make Unique" is an editor action.
- `duplicate(true)` copies nested arrays and dictionaries and internal sub-resources. 4.5+: it no longer copies external resources; use `duplicate_deep(Resource.DEEP_DUPLICATE_ALL)` for that.
- `.tres` is text (diffable), `.res` binary (smaller, faster). Change the format by saving with the other extension.
- Loading a `.tres`/`.res` can instantiate scripts embedded in it. Never load one from `user://`, downloads or mods; use JSON or ConfigFile for user data (see `references/save-and-config.md`).
- Registries: an autoload with an exported `Array[ItemData]`, or a preload list. A `DirAccess` scan for `*.tres` breaks in exports (files become `.remap`); 4.4+: `ResourceLoader.list_directory()` handles that.
- Don't store secrets in `.tres`: exports ship them in plain text.
- `ResourceLoader.exists(path)` before an optional `load()`; `ResourceUID` converts `uid://` and paths (`ResourceUID.uid_to_path()`).
- Avoid cycles (A references B references A); use ids.

## Project layout

- Co-locate by feature (`player/player.tscn`, `player/player.gd`, `player/player.png`) for most games; split by type (`scenes/`, `scripts/`, `art/`) only if the team already does.
- Use snake_case for files and folders; PascalCase for node names and `class_name`.
- Commit `project.godot`, `*.import`, `*.uid` (4.4+), `export_presets.cfg` (without secrets) and `addons/`. Ignore `.godot/` (a `.import/` folder is Godot 3). The new-project wizard writes a suitable `.gitignore` and `.gitattributes`.
