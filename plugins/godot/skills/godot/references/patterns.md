# GDScript patterns

Worked Godot code for node-based state machines, the event bus, components, dependency wiring, object pools and a scene manager. Choosing between an enum, node or data-driven FSM, and the engine-neutral reasoning, is in `game-architecture`.

Contents: Node-based state machine; Event bus (autoload); Components; Dependency wiring; Object pool; Scene manager (autoload).

## Node-based state machine

Use it once an enum-plus-`match` script duplicates enter/exit logic or passes about 100 lines. Each state is a child node; it returns the name of the next state, or `&""` to stay.

```gdscript
class_name State extends Node
var entity: Node            # set by the machine
var machine: StateMachine
func enter() -> void: pass
func exit() -> void: pass
func update(_delta: float) -> StringName: return &""
func physics_update(_delta: float) -> StringName: return &""
func handle_input(_event: InputEvent) -> StringName: return &""
```
```gdscript
class_name StateMachine extends Node
@export var initial_state: State
@export var auto_start := true          # false for a nested machine
var current: State
var _states: Dictionary[StringName, State] = {}   # 4.4+ typed Dictionary

func _ready() -> void:
	for child in get_children():
		if child is State:
			_states[child.name] = child
			child.entity = owner
			child.machine = self
	if auto_start: start()
	else: set_active(false)

func start() -> void: set_active(true); current = initial_state; current.enter()
func stop() -> void:
	if current: current.exit()
	set_active(false)

func set_active(on: bool) -> void:
	set_process(on); set_physics_process(on); set_process_unhandled_input(on)
func _process(delta: float) -> void: _go(current.update(delta))
func _physics_process(delta: float) -> void: _go(current.physics_update(delta))
func _unhandled_input(event: InputEvent) -> void: _go(current.handle_input(event))
func _go(next: StringName) -> void:
	if next.is_empty() or next == current.name: return
	if not _states.has(next): push_error("unknown state %s" % next); return
	current.exit()
	current = _states[next]
	current.enter()
```

- Use `StringName` keys everywhere (`&"Run"`); node names are `StringName`. Start animations in `enter()`, undo side effects in `exit()`. Never transition from inside `enter()` in a way that can loop in one frame. `owner` is the scene root, so the machine works at any depth.
- **Hierarchical:** a state that owns a sub-machine (`OnGround` holding `Idle/Walk/Run`) sets the sub-machine's `auto_start = false`, calls `sub.start()` in its `enter()` and `sub.stop()` in its `exit()`. Otherwise the sub-machine enters its initial state in its own `_ready` and keeps reading input while the parent state is inactive. The parent state checks its own exits (`not is_on_floor()` -> `&"InAir"`) before deferring to the sub-machine.
- **Parallel:** separate machines for independent concerns (movement, combat) give 3 + 3 states instead of 3 x 3. Two machines must never write the same field (both setting `velocity`); one owns it, the other reads.

## Event bus (autoload)

Use a bus for unrelated nodes: UI, audio and save systems reacting to gameplay. Keep direct signals for child-to-parent, and method calls for parent-to-child ("signals up, calls down, bus sideways").

```gdscript
# autoloads/event_bus.gd, registered as EventBus
extends Node
signal player_died
signal score_changed(new_score: int)
signal item_collected(item: ItemData)   # a small Resource beats a Dictionary
```

- Type every parameter. Past two or three values, pass a `Resource` or `class_name` payload.
- Producers call `EventBus.score_changed.emit(score)`; consumers connect in `_ready()`. GDScript connections to a freed object's methods are removed automatically.
- Anti-patterns: routing parent-child talk through the bus; handlers that emit further bus signals (put multi-step reactions in one manager); a listener re-emitting the signal it received (infinite loop); a bus with hundreds of signals nobody can trace.
- Test against the real autoload (`watch_signals(EventBus)` in GUT, see `godot-testing`).

## Components

Small scenes with one job each (`HealthComponent`, `HitboxComponent`, `HurtboxComponent`), dropped onto any entity.

```gdscript
class_name HurtboxComponent extends Area2D
signal hurt(amount: int)
@export var health: HealthComponent     # wired explicitly in the Inspector
@export var iframes := 0.0
var _invincible := false

func receive_hit(amount: int) -> void:
	if _invincible: return
	hurt.emit(amount)
	if health: health.take_damage(amount)
	if iframes > 0.0:
		_invincible = true
		await get_tree().create_timer(iframes, false).timeout
		_invincible = false
```

- Flow: `HitboxComponent` (`area_entered`, `area is HurtboxComponent`) calls `receive_hit(damage)`; the hurtbox calls its wired `HealthComponent`; health emits `health_changed` / `died` for UI and game logic. Put a cooldown on the hitbox so a lingering overlap does not hit every frame.
- A component touches another only through an explicitly wired reference (`@export`, or set by the parent), never `get_parent().get_node("Sibling")`.
- Wiring order of preference: `@export` (assigned before `_ready`), `@onready var x := $Child` for always-present children, `get_node_or_null()` for optional ones. Scenes built in code or hand-written `.tscn` need the reference set in the parent's `_ready()`.
- Find by type: loop `get_children()` with `is_instance_of(child, HealthComponent)`.

## Dependency wiring

| Pattern | Use for | Cost |
| --- | --- | --- |
| Autoload | Truly global services: audio, settings, save, event bus | Hidden coupling; hard to test |
| `@export` injection | Most nodes; editor-wired, 1 to 3 deps | Null if not wired |
| Scene injection | A level wires its enemies, a HUD its panels, in the parent's `_ready()` (children are ready first) | Parent must know the needs |
| Service locator | Optional or swappable services (mods, platform backends) | Becomes an untyped god object |

- Autoload only the global few; keep spawners and inventories as scene nodes.
- Break circular `_ready` lookups with a signal instead of mutual references.
- Guard an unwired dependency with `push_error("...: audio not set"); return`. Avoid `assert()` for this: it is stripped from release builds and can hang a headless test run.

## Object pool

Pool things spawned many times a second (bullets, hit sparks); measure first (`references/performance.md`). Shown for 2D; use `Node3D` in 3D.

```gdscript
class_name ObjectPool extends Node
@export var scene: PackedScene
@export var size := 32
var _free: Array[Node2D] = []

func _ready() -> void:
	for i in size: _free.append(_make())
func _make() -> Node2D:
	var n := scene.instantiate() as Node2D
	n.process_mode = Node.PROCESS_MODE_DISABLED
	n.hide()
	add_child(n)
	return n
func take() -> Node2D:
	var n: Node2D = _free.pop_back() if not _free.is_empty() else _make()
	n.process_mode = Node.PROCESS_MODE_INHERIT
	n.show()
	return n
func give_back(n: Node2D) -> void:
	n.process_mode = Node.PROCESS_MODE_DISABLED
	n.hide()
	_free.append(n)
```

- Reset per-use state in an `on_spawn()` hook, not `_ready()` (it runs once). Return a pooled physics object from a physics callback with `give_back.call_deferred(self)`; disabling a body mid-callback gives "flushing queries" errors.

## Scene manager (autoload)

- Fade out, load, swap, fade in. For big scenes load in the background: `ResourceLoader.load_threaded_request(path)`, poll `load_threaded_get_status(path, progress)` once per frame (`await get_tree().process_frame`) for a progress bar, then `load_threaded_get(path)` (see `references/threading.md`).
- Swap with `get_tree().change_scene_to_packed(packed)` (deferred, so the old scene finishes its frame), or manually: `queue_free()` the old scene, `get_tree().root.add_child(new)`, then set `get_tree().current_scene = new`.
- Keep the transition overlay (a `CanvasLayer`) in the autoload so it survives the swap.
