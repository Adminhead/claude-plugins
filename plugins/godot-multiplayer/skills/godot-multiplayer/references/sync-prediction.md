# State sync, interpolation, prediction and lag compensation

`MultiplayerSynchronizer` facts are checked against the Godot 4.7 class reference. The netcode techniques are engine-neutral; Godot has no built-in prediction or rollback, so they are built on top of RPCs and synchronizers (or an addon such as netfox, which the project should vet itself).

## State or input?

| | Sync state | Sync input (lockstep or rollback) |
| --- | --- | --- |
| What travels | Property values from the server | Each player's input per tick |
| Who simulates | The server; clients display | Every peer, identically |
| Needs determinism | No | Yes. Godot physics and float math are not deterministic across machines. |
| Bandwidth | Higher | Lower |
| Fits | Action games, shooters, most real-time games | Fighting games, RTS, turn-based games |

Most Godot games should sync state from the server, predict only the local player, and interpolate everyone else.

## Server-owned state with a synchronizer

- The server writes the replicated properties; the synchronizer's authority stays `1`.
- Replicate the minimum needed to draw the entity: position, facing, an animation state as an `int` enum, health on change.
- Use **On Change** for values that rarely change (health, equipment) and **Always** with a `replication_interval` (for example `0.05`, 20 Hz) for continuous ones. Both intervals default to `0.0`, every network process frame.
- Don't replicate `position` directly if you interpolate: replicate a `net_position` property and let the display code move the node.

## Interpolating remote entities

Render remote entities a little in the past (about 100 ms, or two to three update intervals) and blend between the two snapshots around the render time. That hides jitter and a dropped packet. `Engine.get_physics_interpolation_fraction()` is about physics ticks, not network updates, so it is the wrong clock here.

```gdscript
# On the entity; the synchronizer replicates net_position (written by the server each tick).
const DELAY_MS := 100
var net_position := Vector2.ZERO
var _buf: Array[Dictionary] = []          # {"t": msec received, "p": Vector2}

func _ready() -> void:
	$Sync.synchronized.connect(_on_update)
	$Sync.delta_synchronized.connect(_on_update)

func _physics_process(_delta: float) -> void:
	if multiplayer.is_server():
		net_position = global_position

func _on_update() -> void:
	_buf.append({"t": Time.get_ticks_msec(), "p": net_position})
	if _buf.size() > 32:
		_buf.pop_front()

func _process(_delta: float) -> void:
	if multiplayer.is_server() or _buf.is_empty():
		return
	var render_t := Time.get_ticks_msec() - DELAY_MS
	while _buf.size() >= 2 and _buf[1]["t"] <= render_t:
		_buf.pop_front()
	if _buf.size() < 2:
		global_position = _buf[0]["p"]     # starved: hold the last known position
		return
	var ta: int = _buf[0]["t"]
	var tb: int = _buf[1]["t"]
	var pa: Vector2 = _buf[0]["p"]
	var pb: Vector2 = _buf[1]["p"]
	var f := clampf(float(render_t - ta) / maxf(float(tb - ta), 1.0), 0.0, 1.0)
	global_position = pa.lerp(pb, f)
```

Snap discrete values (health, animation state) instead of blending them. For a large correction such as a teleport, clear the buffer.

## Predicting the local player

1. Each physics tick, the client reads input, applies it to its own avatar at once, stores `{tick, input}` in a **bounded** ring buffer (about one second of ticks), and sends `{tick, input}` to the server unreliably, ideally repeating the last few inputs in each packet to survive loss.
2. The server applies inputs in tick order, after the validation in the main skill: clamp the input, drop ticks that are old, duplicated or too far in the future, and cap inputs processed per tick so a client can't speed up by sending more.
3. The server sends back the authoritative state and the last tick it processed.
4. The client drops acknowledged inputs, resets the avatar to the server state, and replays the remaining inputs. `move_and_slide()` uses the physics delta, so replay inputs at the fixed tick, not with a variable delta.
5. Ignore tiny errors, and smooth medium ones over 100 to 200 ms so corrections don't look like jitter. Snap large ones.

Predict only movement and local cosmetic effects (muzzle flash, sound). Damage, pickups and scores wait for the server.

## Lag compensation for hits

To be fair to a lagging shooter, the server checks a hit against where targets were when the shooter saw them:

- Keep a per-tick history of each hittable entity's position (and hitbox state) for a short window, for example 200 to 500 ms, and prune it every tick.
- The client sends the shot with the tick it was rendering. The server **clamps** that tick to `[now - max_rewind, now]` so a client can't claim an arbitrarily old view, rewinds hitboxes to it, runs the ray or shape test, and applies damage itself.
- Rewind only for the hit test. Never move live nodes back, and never let the client report "I hit X" as a fact.

## Bandwidth

- Sync fewer properties, less often: On Change for slow values, a lower `replication_interval` for distant or unimportant entities.
- Use visibility filters for interest management. They save bandwidth and hide information (an unseen enemy's position) from cheaters.
- Send compact types: an `int` enum instead of a String state name, and quantized values (a `PackedByteArray` or ints in fixed-point) when floats dominate a hot RPC.
- Use reliable delivery only for events. Streams go unreliable on their own channel, so a lost packet doesn't stall the queue.
- Measure before optimizing: the debugger's Network Profiler shows RPC and synchronizer traffic per node.
