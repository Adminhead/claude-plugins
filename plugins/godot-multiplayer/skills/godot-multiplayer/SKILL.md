---
name: godot-multiplayer
description: Builds and secures networked Godot 4 games: server-authoritative @rpc validation, ENet and WebSocket peers, MultiplayerSpawner and MultiplayerSynchronizer, lobbies, dedicated servers, interpolation and prediction. Use for @rpc, "multiplayer", "netcode" or a headless server in a Godot project.
license: Apache-2.0 AND MIT
---

# Godot multiplayer

Written for Godot 4.x high-level multiplayer (`SceneMultiplayer`), checked against 4.7. Read the project's version from `config/features` in `project.godot` first. Server and clients must run the **same Godot version**, because the high-level protocol is only compatible within one version, so send a version string during the handshake.

Not for: local split-screen (no networking), raw sockets and `PacketPeer` protocols, HTTP. Scene, node and GDScript basics belong to the `godot` skill, export presets to `godot-export`, and C# syntax to `godot-csharp`.

## Rule one: the server decides

Every client is a possible cheater. A client sends **intent** (input, "I want to fire", "buy item 3"). The server checks it, applies it, and replicates the result. Every `"any_peer"` RPC starts with the same checks:

1. **Run only where intended:** `if not multiplayer.is_server(): return`.
2. **Who sent it:** `var sender := multiplayer.get_remote_sender_id()`. Never take a player id from the arguments.
3. **May this sender do this to this node?** Compare against the node's owner (`owner_id == sender`) or your player table.
4. **Are the arguments sane?** Clamp vectors (`dir.limit_length(1.0)`), reject non-finite values (`is_finite()`), range-check indices, enforce cooldowns and rate limits, and check distance from the sender's avatar.
5. **Never use client data as a path or code:** no `load(client_string)`, no `Expression` on client input, no `str_to_var` of client text. Map a client choice to a server-side table index instead.
6. **Keep `SceneMultiplayer.allow_object_decoding` off** (the default). Decoded objects can carry code.
7. **Don't replicate secrets.** Use `MultiplayerSynchronizer` visibility to stop sending hidden enemies, other hands of cards or server-only state to peers that shouldn't see them.

## Core workflow

1. **Peer:** create an `ENetMultiplayerPeer` (or `WebSocketMultiplayerPeer` for web exports, which can't use ENet), call `create_server(port, max_clients)` or `create_client(address, port)`, **check the returned `Error`** (a port in use returns `ERR_CANT_CREATE` and otherwise looks like a hang), then assign it to `multiplayer.multiplayer_peer`.
2. **Ids:** the server is always peer `1`. Clients get random positive ids, never sequential.
3. **Signals:** connect `peer_connected`, `peer_disconnected`, `connected_to_server`, `connection_failed` and `server_disconnected`.
4. **Spawn on the server** through a `MultiplayerSpawner`: list the scenes, set `spawn_path`, then `add_child(node, true)` under it on the server. Clients get the node with the same name and path, and RPCs route by that path.
5. **Authority is not replicated.** `set_multiplayer_authority()` changes only the local peer. Set it identically on every peer, for example from the node name in `_enter_tree()` or from the spawn data in a `spawn_function`.
6. **Replicate state** with a `MultiplayerSynchronizer` owned by the server. Interpolate remote entities. Predict only the local player.
7. **Leave cleanly:** `multiplayer.multiplayer_peer = OfflineMultiplayerPeer.new()` (C#: `Multiplayer.MultiplayerPeer = null;`).

## Server-authoritative movement

The server owns the body (default authority `1`). The owning client only sends input.

```gdscript
extends CharacterBody2D          # spawned by a MultiplayerSpawner, named after its owner's peer id

const SPEED := 200.0
var owner_id := 1
var _dir := Vector2.ZERO          # the server's copy of the owner's latest input

func _enter_tree() -> void:
	owner_id = name.to_int()      # the same on every peer

func _physics_process(_delta: float) -> void:
	if multiplayer.get_unique_id() == owner_id:
		var dir := Input.get_vector("left", "right", "up", "down")
		if multiplayer.is_server():
			_dir = dir            # a listen-server host plays locally
		else:
			submit_input.rpc_id(1, dir)
	if multiplayer.is_server():
		velocity = _dir * SPEED
		move_and_slide()          # a server-owned MultiplayerSynchronizer replicates position

@rpc("any_peer", "call_remote", "unreliable_ordered")
func submit_input(dir: Vector2) -> void:
	if not multiplayer.is_server():
		return
	if multiplayer.get_remote_sender_id() != owner_id:
		return                    # a peer trying to drive someone else's avatar
	if not dir.is_finite():
		return
	_dir = dir.limit_length(1.0)  # never trust the magnitude
```

C# attribute form: `[Rpc(MultiplayerApi.RpcMode.AnyPeer, CallLocal = false, TransferMode = MultiplayerPeer.TransferModeEnum.UnreliableOrdered)]`, sent with `RpcId(1, MethodName.SubmitInput, dir)`. More forms are in [references/replication-and-rpc.md](references/replication-and-rpc.md).

## `@rpc` in brief

`@rpc(mode, sync, transfer_mode, transfer_channel)`. Bare `@rpc` means `@rpc("authority", "call_remote", "reliable", 0)`.

- `"authority"` (the default): only the node's authority may call it. Remote calls from other peers are dropped. Use it for server-to-client broadcasts.
- `"any_peer"`: any peer may call it. Use it only for client-to-server requests, and validate as above.
- `"call_local"` also runs the method on the caller, which a listen-server host needs.
- `"reliable"` for events (spawn, damage, chat, state changes); `"unreliable_ordered"` or `"unreliable"` for streams the next packet supersedes (input, positions). Put streams on their own channel (the 4th argument) so they don't queue behind reliable traffic.
- Call with `method.rpc(args)` (all peers) or `method.rpc_id(peer_id, args)`.
- Every peer must have the same `@rpc` methods with the same settings in each script, including unused ones. Gate server-only behaviour inside the method, not by deleting it from the client build.
- RPCs live on `Node` scripts and take plain data (numbers, strings, vectors, arrays, dictionaries, packed arrays), not Objects or Callables.

## Pitfalls

| Symptom | Cause | Fix |
| --- | --- | --- |
| Client's RPC never runs on the server | Method is `"authority"` (the default) | `"any_peer"`, plus server-side validation |
| Every peer moves every player | No authority or owner check before reading input | Gate input on `owner_id == multiplayer.get_unique_id()` or `is_multiplayer_authority()` |
| `is_multiplayer_authority()` true on the server only | Authority set only on the server | Set it on every peer (`_enter_tree` from the name, or `spawn_function`) |
| Node exists on the server, missing on clients | Added outside the spawner's `spawn_path`, scene not in its spawnable list, or added on a client | Add it on the server under `spawn_path` with the scene listed |
| RPC errors naming the wrong function | `@rpc` sets differ between builds | Same script on every peer |
| "Node not found" on RPC | Names differ across peers | Spawner-created nodes and `add_child(node, true)` |
| Synchronized property never arrives | An Object or Resource property, or the synchronizer's authority isn't the writer | Sync plain values; write only on the authority |
| Join hangs | `create_client` failed, firewall, or wrong port | Check the `Error`; open the UDP port; handle `connection_failed` |
| Android build can't connect | No INTERNET permission | Enable it in the Android export preset |

## References

- [references/replication-and-rpc.md](references/replication-and-rpc.md): `@rpc` and C# `[Rpc]` in full, `MultiplayerSpawner` (auto-spawn, `spawn_function`, a whitelisted client spawn request), `MultiplayerSynchronizer` setup and visibility, transfer modes and channels.
- [references/join-and-disconnect.md](references/join-and-disconnect.md): the lobby flow, the authentication handshake with a version check, max-player limits and kicks, disconnect cleanup and reconnecting.
- [references/sync-prediction.md](references/sync-prediction.md): state versus input sync, snapshot interpolation, client-side prediction and reconciliation, lag compensation, bandwidth.
- [references/dedicated-server.md](references/dedicated-server.md): headless runs and the `dedicated_server` feature tag, the "Export as dedicated server" preset, server configuration from the command line, match flow, Docker and systemd.

Adapted from awesome-gamedev-agent-skills `godot-multiplayer` (Apache-2.0) and GodotPrompter `multiplayer-basics`, `multiplayer-sync` and `dedicated-server` (MIT). See NOTICE.
