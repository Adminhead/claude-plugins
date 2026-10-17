# Navigation

NavigationRegion and NavigationAgent API in 2D and 3D: baking, layers, the agent loop, avoidance, repathing, and server queries. Written for Godot 4.x, checked against 4.7.

AI decision-making (FSM, behavior trees, utility AI, steering) is in `game-ai`; body movement in `godot-physics`; tile navigation layers in `references/2d.md`.

Contents: Setup; Runtime baking; Navigation layers; Agent loop; Agent properties; Repathing a moving target; Avoidance pitfalls; Links and server queries; Version notes.

## Setup

```
Level (Node2D)
├── NavigationRegion2D        # NavigationPolygon; parses the geometry below it
│   ├── TileMapLayer / StaticBody2D walls
├── Enemies (Node2D)
│   └── Enemy (CharacterBody2D)
│       └── NavigationAgent2D
```

- Keep agents out from under the region. A region parses its children (by default) when baking, so an enemy's collider under it gets carved into the mesh.
- 2D: give the region a `NavigationPolygon`, draw the outline or let it parse static colliders and meshes, then Bake NavigationPolygon. 3D: `NavigationMesh` on a `NavigationRegion3D`, Bake NavigationMesh.
- Clearance for wide agents comes from the bake: `NavigationPolygon.agent_radius` / `NavigationMesh.agent_radius` (plus `agent_height`, `agent_max_climb`, `agent_max_slope` in 3D) shrink the walkable area. `NavigationAgent.radius` is for avoidance only and does not change paths. Bake one mesh per agent size, on separate navigation maps or layers.
- Parsed geometry: the resource's parsed geometry type (meshes, static colliders, both), its collision mask, and `source_geometry_mode` (region children by default, or a node group) decide what gets baked. `cell_size` should match the navigation map's cell size.
- TileSet navigation layers work for small maps; for large ones, bake a region over the tiles instead.

## Runtime baking

- `bake_navigation_polygon(on_thread = true)` (2D) and `bake_navigation_mesh(on_thread = true)` (3D) bake on a background thread by default. Connect `bake_finished` (one-shot) and don't query until it fires.
- Passing `false` blocks the main thread; avoid it for large maps.
- Web exports without thread support bake on the main thread.
- Rebake after the level changes (procedural layout, destroyed walls). For small dynamic blockers, prefer avoidance obstacles (`NavigationObstacle2D/3D`) over rebaking.

## Navigation layers

`navigation_layers` is a bitmask on both regions and agents. An agent paths only through regions sharing a bit (ground = 1, air = 2, large = 4). A mismatch is the usual cause of "no path". Name the layers in Project Settings > Layer Names > 2D/3D Navigation.

## Agent loop

```gdscript
extends CharacterBody2D

@export var speed := 120.0
@onready var agent: NavigationAgent2D = $NavigationAgent2D

func _ready() -> void:
	agent.velocity_computed.connect(_on_velocity_computed)
	_setup.call_deferred()  # never await inside _ready

func _setup() -> void:
	await get_tree().physics_frame  # the map is empty until the first sync
	agent.target_position = Vector2(400, 200)

func _physics_process(_delta: float) -> void:
	if agent.is_navigation_finished():
		return
	var next := agent.get_next_path_position()
	var desired := global_position.direction_to(next) * speed
	if agent.avoidance_enabled:
		agent.velocity = desired  # result arrives in velocity_computed
	else:
		_on_velocity_computed(desired)

func _on_velocity_computed(safe_velocity: Vector2) -> void:
	velocity = safe_velocity
	move_and_slide()
```

- Call `get_next_path_position()` once per physics frame; it advances the path. Check `is_navigation_finished()` first.
- 3D: flatten the direction (`y = 0`), apply gravity to `velocity.y` yourself, and keep the agent's `path_height_offset` and the mesh cell height consistent.
- Signals: `path_changed`, `waypoint_reached`, `target_reached`, `navigation_finished`, `link_reached`.

## Agent properties

| Property | 2D default | 3D default | Notes |
|---|---|---|---|
| `path_desired_distance` | 20.0 | 1.0 | Too high skips points and leaves the mesh; too low overshoots into a repath loop |
| `target_desired_distance` | 10.0 | 1.0 | Larger than path distance ends early |
| `path_max_distance` | | | Repath when the agent strays this far |
| `avoidance_enabled` | false | false | RVO avoidance; needs the `velocity_computed` loop |
| `radius`, `max_speed`, `neighbor_distance`, `time_horizon_agents` | | | Avoidance only |
| `avoidance_layers`, `avoidance_mask` | | | Who avoids whom |

Tune the two distances to the agent's speed: an agent moving more than `path_desired_distance` per tick overshoots.

## Repathing a moving target

Setting `target_position` every frame requests a new path every frame. Throttle it: a `Timer` at 0.2 to 0.5 s, or repath only when the target has moved more than a set distance. Stagger timers across many agents so they don't all repath on the same tick.

## Avoidance pitfalls

- Jitter near other agents: raise `time_horizon_agents` a little or lower `max_speed`; check `radius` matches the body.
- Agents pushing through walls: avoidance ignores the navmesh. Keep `max_speed` modest and let the path keep them on the mesh; use static `NavigationObstacle` vertices for walls agents must avoid.
- `velocity_computed` never fires: `avoidance_enabled` is off, or `velocity` was not set this tick.

## Links and server queries

- `NavigationLink2D/3D` joins disconnected areas (jumps, ladders, teleporters); handle the traversal in `link_reached`.
- Query without an agent (for AI scoring or spawn checks):

```gdscript
var map := get_world_2d().get_navigation_map()
var path := NavigationServer2D.map_get_path(map, from, to, true)
var nearest := NavigationServer2D.map_get_closest_point(map, point)
```

  Don't name such a helper `get_path_to`; that is a `Node` method.
- `NavigationServer2D.map_changed` fires after a map sync; useful when regions load later than agents.
- The servers are thread safe for queries; `AStar2D`/`AStarGrid2D` are not (see `references/threading.md`).
- `AStarGrid2D` is simpler than a navmesh for strict tile grids.

## Version notes

- 4.5+: `NavigationServer2D` is its own server instead of a front end for the 3D one. No API change. Custom 2D-only export templates can drop 3D navigation with the SCons option `disable_navigation_3d=yes` if no 3D navigation nodes are used.
- 4.7+: `NavigationServer3D.map_get_closest_point_normal()` returns a normalized vector.
