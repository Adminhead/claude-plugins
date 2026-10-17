# Signals and groups

Declaring, emitting and connecting signals, connection flags, awaiting with a timeout, and groups. Godot 4.x, checked against 4.7. The event bus and component wiring patterns are in `references/patterns.md`.

Contents: Declare, emit, connect; Connection flags; Await a signal; Signals or direct calls; Groups.

## Declare, emit, connect

```gdscript
# coin.gd: reusable, knows nothing about who listens
class_name Coin extends Area2D
signal collected(value: int)

func _on_body_entered(body: Node2D) -> void:
    if body.is_in_group(&"player"):
        collected.emit(10)
        queue_free()
```

```gdscript
# level.gd: the parent wires children
func _ready() -> void:
    for coin: Coin in get_tree().get_nodes_in_group(&"coins"):
        coin.collected.connect(_on_coin_collected)

func _on_coin_collected(value: int) -> void:
    GameState.add_score(value)
```

- Name signals in the past tense (`died`, `health_changed`), and type the parameters. Emitting the wrong argument count errors at runtime.
- Connect with a Callable: `sig.connect(_on_sig)`. Editor connections (Node dock) are saved in the `.tscn` as `[connection]` lines with `CONNECT_PERSIST`.
- `cb.bind(a, b)` appends arguments after the signal's own; `cb.unbind(n)` drops the last `n` signal arguments (`changed.connect(_refresh.unbind(1))`).
- Connecting the same Callable twice errors ("already connected"). Guard re-connections with `if not sig.is_connected(cb):`, or connect once in `_ready()` of the owner, not on every re-entry.
- When the object owning the target method is freed, Godot removes the connection. Lambdas are not owned by a node the same way: disconnect them yourself in `_exit_tree()`, or connect a method.
- Inspect live connections with `sig.get_connections()` or `get_signal_connection_list(&"sig")`.

## Connection flags

| Flag | Effect |
| --- | --- |
| `CONNECT_ONE_SHOT` | Disconnect after the first emission |
| `CONNECT_DEFERRED` | Call at idle time at the end of the frame. Use when the handler changes the tree or physics state during a physics callback |
| `CONNECT_PERSIST` | Save with the scene (what editor connections use) |
| `CONNECT_REFERENCE_COUNTED` | Allow the same connection several times; it needs as many disconnects |

```gdscript
$Door.opened.connect(_on_door_opened, CONNECT_ONE_SHOT)
$RedButton.pressed.connect(_on_button.bind(&"red"))
```

## Await a signal

```gdscript
func open_chest() -> void:
    $AnimationPlayer.play(&"open")
    await $AnimationPlayer.animation_finished
    spawn_loot()
```

`await` has no timeout and there is no `Signal.any()`. To race a signal against a timer, funnel both into a signal you own:

```gdscript
signal _wait_done(ok: bool)

func wait_for_hit(timeout_sec: float) -> bool:
    var timer := get_tree().create_timer(timeout_sec)
    var on_hit := func(_dmg: int) -> void: _wait_done.emit(true)
    var on_timeout := func() -> void: _wait_done.emit(false)
    hurtbox.hit.connect(on_hit)
    timer.timeout.connect(on_timeout)
    var ok: bool = await _wait_done
    if is_instance_valid(hurtbox):
        hurtbox.hit.disconnect(on_hit)
    timer.timeout.disconnect(on_timeout)
    return ok
```

The lambdas emit rather than set a local flag, because lambdas capture locals by value. Every awaiter of `_wait_done` resumes on the first emit, so run one wait at a time per node.

## Signals or direct calls

- Signal when the emitter should not know who listens: reusable scenes, zero to many listeners, gameplay to UI.
- Direct call when an owner drives something it created or holds (a controller calling its component). Signals for tightly coupled pairs only add indirection.
- Throttle per-frame signals (position updates) or poll instead; a signal storm shows up in the profiler.

## Groups

```gdscript
func _ready() -> void:
    add_to_group(&"enemies")           # or Node dock > Groups (saved in the scene)

func freeze_all() -> void:
    get_tree().call_group(&"enemies", &"set_frozen", true)
```

| Call | Does |
| --- | --- |
| `add_to_group(g, persistent)`, `remove_from_group(g)`, `is_in_group(g)` | Membership. `persistent = true` saves a code-added group with the scene |
| `get_tree().get_nodes_in_group(g)` | `Array[Node]` of members |
| `get_tree().get_first_node_in_group(g)` | First member or `null` |
| `get_tree().call_group(g, method, ...)` | Call on every member; members without the method are skipped |
| `get_tree().set_group(g, property, value)` | Set a property on every member |
| `get_tree().call_group_flags(flags, g, method, ...)` | `GROUP_CALL_DEFERRED`, `GROUP_CALL_REVERSE`, `GROUP_CALL_UNIQUE` |
| `get_tree().get_node_count_in_group(g)` | Member count |

- Groups are global to the SceneTree: two scenes using the same name share it. Prefix names when that matters.
- `call_group()` fails silently on a typo in the method name; prefer a typed signal or a typed loop when the contract matters.
- Use groups for "all of a kind" (enemies, saveables, the player); use signals for "something happened".
