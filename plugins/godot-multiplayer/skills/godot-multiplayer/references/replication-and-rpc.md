# RPCs, spawning and synchronizing

Checked against the Godot 4.7 class reference (`@rpc`, `Node`, `MultiplayerSpawner`, `MultiplayerSynchronizer`, `SceneMultiplayer`).

## `@rpc` in full

```gdscript
@rpc(mode, sync, transfer_mode, transfer_channel)
@rpc                                                   # = @rpc("authority", "call_remote", "reliable", 0)
@rpc("any_peer", "unreliable_ordered")
@rpc("authority", "call_local", "reliable", 2)        # the channel is always the last argument
```

| Argument | Values | Meaning |
| --- | --- | --- |
| mode | `"authority"` (default), `"any_peer"` | Who may call it remotely |
| sync | `"call_remote"` (default), `"call_local"` | Whether the caller runs it too |
| transfer_mode | `"reliable"` (default), `"unreliable_ordered"`, `"unreliable"` | Delivery guarantee |
| transfer_channel | int, default `0` | Separate queues so streams don't wait behind reliable events |

Inside an RPC, `multiplayer.get_remote_sender_id()` is the caller's peer id (the local id for a `call_local` run).

| Transfer mode | Delivery | Use for |
| --- | --- | --- |
| `reliable` | Guaranteed, in order | Spawn, damage, chat, match state, purchases |
| `unreliable_ordered` | May drop; late packets are discarded | Input and position streams |
| `unreliable` | May drop or reorder | Frequent, independent updates (effects, pings) |

## C# forms

```csharp
[Rpc(MultiplayerApi.RpcMode.AnyPeer, TransferMode = MultiplayerPeer.TransferModeEnum.Reliable)]
public void RequestFire() { /* validate first */ }

[Rpc(MultiplayerApi.RpcMode.Authority, CallLocal = true,
     TransferMode = MultiplayerPeer.TransferModeEnum.UnreliableOrdered, TransferChannel = 1)]
private void SyncState(Vector2 pos) { /* ... */ }

// Calls use the generated MethodName constants:
Rpc(MethodName.SyncState, GlobalPosition);           // every peer
RpcId(1, MethodName.RequestFire);                    // the server
long sender = Multiplayer.GetRemoteSenderId();
```

The class must be `partial` (the generator registers the RPCs), and peer-id signal handlers take `long`: `Multiplayer.PeerConnected += (long id) => ...`.

## Peer ids and authority

| Id | Who |
| --- | --- |
| `1` | The server, always |
| other positive ints | Clients, random, not sequential |

- Every node's authority defaults to `1`.
- `set_multiplayer_authority(id, recursive = true)` changes only the **local** peer's view. The docs say so: it does not replicate. Set it on every peer, using a `spawn_function`, an RPC, or a value every peer can derive (the node name).
- A parent's authority does not reach children added later. Set it on each new child, or set it again on the parent with `recursive`.
- Check with `is_multiplayer_authority()` and `get_multiplayer_authority()`; the local id is `multiplayer.get_unique_id()`.

## MultiplayerSpawner

The spawner replicates nodes that its authority (the server, by default) adds under `spawn_path`, and removes them on clients when the server frees them.

**Auto spawn.** Add the scenes to the spawner's Auto Spawn List (or `add_spawnable_scene(path)`), set `spawn_path`, then on the server:

```gdscript
func spawn_player(peer_id: int) -> void:      # server only
	var p := preload("res://player/player.tscn").instantiate()
	p.name = str(peer_id)                     # every peer derives the owner from the name
	$Players.add_child(p, true)               # $Players is the spawner's spawn_path
```

**Custom spawn.** Set `spawn_function` on **every** peer, and call `spawn(data)` on the server. The function runs on each peer with the same `data`, so it is the place to set authority and initial values. `data` must be serializable plain data.

```gdscript
func _ready() -> void:
	$Spawner.spawn_function = _make_player

func _make_player(data: Variant) -> Node:
	var p := preload("res://player/player.tscn").instantiate()
	p.name = str(data.id)
	p.position = data.pos
	p.set_multiplayer_authority(data.id)      # runs on every peer, so authority matches everywhere
	return p

# server: $Spawner.spawn({"id": peer_id, "pos": Vector2(100, 300)})
```

`spawn_limit` caps the number of spawned nodes (`0` means no limit).

**A client asking for a spawn: whitelist it.** Never `load()` a path the client sends. Take an index into the spawner's own list, and validate it:

```gdscript
@rpc("any_peer", "call_remote", "reliable")
func request_spawn(kind: int, at: Vector2) -> void:
	if not multiplayer.is_server():
		return
	var sender := multiplayer.get_remote_sender_id()
	if kind < 0 or kind >= $Spawner.get_spawnable_scene_count():
		return
	if not _may_spawn(sender, at):            # budget, cooldown, distance from the sender's avatar
		return
	var node: Node2D = load($Spawner.get_spawnable_scene(kind)).instantiate()
	node.position = at
	$Props.add_child(node, true)              # $Props is the spawner's spawn_path
```

## MultiplayerSynchronizer

It sends the configured properties from its authority to the other peers.

- Add it as a child of the node to replicate. `root_path` (default `..`) is the node that property paths are relative to.
- In the Replication panel, add property paths such as `.:position`, `.:velocity` or `Sprite2D:modulate`. Each property has a replication mode (**Always**, **On Change** or **Never**) and a **Spawn** checkbox that sends the value with the spawn.
- `replication_interval` paces Always properties and `delta_interval` paces On Change properties. Both default to `0.0`, which means every network process frame, not "disabled". Raise them (for example `0.05` for 20 Hz) to save bandwidth.
- Its signals `synchronized` and `delta_synchronized` fire on receivers when an update lands, which is where to push interpolation snapshots (see `sync-prediction.md`).
- Object properties (Resources and other Objects), instance ids and RIDs can't be synchronized. Sync plain values.
- Only the synchronizer's authority sends. For server authority, leave it at `1` and write the properties only on the server. To let a client stream its own input, give a separate input synchronizer child the client's authority, and have the server validate what it reads from it, as it would for an RPC.

**Visibility.** `public_visibility` (default `true`) sends to everyone. For per-peer data:

```gdscript
$Sync.public_visibility = false
$Sync.set_visibility_for(peer_id, true)                 # an explicit peer
$Sync.add_visibility_filter(func(peer: int) -> bool:   # or a rule: same team, within range
	return _can_see(peer))
$Sync.update_visibility()                               # re-run filters after the inputs change
```

A spawner only spawns a node on peers that can see its synchronizer, which makes visibility filters the tool for interest management and anti-wallhack.

## SceneMultiplayer settings

- `allow_object_decoding` (default `false`): leave it off. Deserialized objects can run code.
- `auth_callback`, `auth_timeout`, `send_auth()`, `complete_auth()`: the handshake that runs before a peer counts as connected. See `join-and-disconnect.md`.
- `refuse_new_connections`: stop accepting peers, for example once a match starts.
- `server_relay` (default `true`): the server tells clients about other peers connecting and relays packets between clients. Set it to `false`, before peers connect, when clients should only ever talk to the server; clients then get no `peer_connected` for each other.
