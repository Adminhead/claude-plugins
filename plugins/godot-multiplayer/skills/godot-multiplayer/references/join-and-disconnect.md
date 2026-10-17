# Joining, authentication and disconnects

Checked against the Godot 4.7 high-level multiplayer tutorial and the `SceneMultiplayer`, `MultiplayerPeer` and `ENetMultiplayerPeer` class pages.

## Host and join

```gdscript
# Network autoload
const PORT := 7000
const MAX_CLIENTS := 8

func host() -> Error:
	var peer := ENetMultiplayerPeer.new()
	var err := peer.create_server(PORT, MAX_CLIENTS)
	if err != OK:
		return err                     # ERR_CANT_CREATE: port in use or not permitted
	multiplayer.multiplayer_peer = peer
	return OK

func join(address: String) -> Error:
	var peer := ENetMultiplayerPeer.new()
	var err := peer.create_client(address, PORT)
	if err != OK:
		return err
	multiplayer.multiplayer_peer = peer
	return OK                          # connected only when connected_to_server fires

func leave() -> void:
	multiplayer.multiplayer_peer = OfflineMultiplayerPeer.new()
```

For a web export, use `WebSocketMultiplayerPeer` (`create_server(port)`, `create_client("wss://host:port")`) because browsers can't open ENet's UDP sockets. Serve `wss://` with TLS in production.

## Lobby flow (server authoritative)

1. **Server starts:** `host()`. On a listen server, add the host to `players` under id `1`. A dedicated server is not a player.
2. **Client connects:** the authentication handshake runs first (below). Only after it does `peer_connected` fire on the server and `connected_to_server` on the client.
3. **Server registers the peer:** check capacity and match state, store `players[id] = {name, ready = false}` with the name sanitised (trim it, cap its length, strip BBCode if a `RichTextLabel` shows it), then send the full player table to everyone with an `"authority"` RPC.
4. **Ready-up:** clients call an `"any_peer"` `set_ready(bool)`. The server records it under `get_remote_sender_id()`, never under an id from the arguments, and rebroadcasts.
5. **Start:** the server chooses the level (a path from its own list) and calls `load_game.rpc(path)`, declared `@rpc("authority", "call_local", "reliable")`, so every peer changes scene together. Each peer reports `player_loaded` with an `"any_peer"` RPC. The server counts them and spawns the avatars through the `MultiplayerSpawner` when all are in.
6. **During the match:** set `multiplayer.multiplayer_peer.refuse_new_connections = true`, or accept late joiners as spectators.

## Authentication and version check

`SceneMultiplayer` runs a handshake before a peer counts as connected. `auth_timeout` defaults to 3 seconds.

```gdscript
const PROTOCOL := "mygame-1.4.0+godot-4.7"     # bump it on any network change

# Server, before or right after assigning the peer:
func _setup_server_auth() -> void:
	multiplayer.auth_callback = _on_auth_request

func _on_auth_request(peer_id: int, data: PackedByteArray) -> void:
	if data.size() > 1024:
		multiplayer.disconnect_peer(peer_id)    # don't parse oversized input
		return
	var msg = JSON.parse_string(data.get_string_from_utf8())
	if typeof(msg) != TYPE_DICTIONARY or msg.get("protocol") != PROTOCOL:
		multiplayer.disconnect_peer(peer_id)
		return
	if not _token_is_valid(msg.get("token", "")):
		multiplayer.disconnect_peer(peer_id)
		return
	_account_for_peer[peer_id] = msg.token       # stable identity; the peer id changes on every connect
	multiplayer.complete_auth(peer_id)

# Client:
func _setup_client_auth() -> void:
	multiplayer.auth_callback = func(_id: int, _data: PackedByteArray) -> void: pass
	multiplayer.peer_authenticating.connect(func(id: int) -> void:
		var payload := JSON.stringify({"protocol": PROTOCOL, "token": _token}).to_utf8_buffer()
		multiplayer.send_auth(id, payload)
		multiplayer.complete_auth(id))
```

- Both sides must call `complete_auth()`. The client sets an `auth_callback` too, or the server's reply has nowhere to go.
- A token check means a real backend or a shared secret. Without one, the handshake still enforces the protocol version.
- `JSON.parse_string` returns `null` on bad input, and numbers come back as `float`. Check types before use.

## Capacity and kicks

- `create_server(port, max_clients)` refuses connections beyond `max_clients` at the transport level.
- To reject a peer for a game reason (lobby full, match running, banned), call `multiplayer.disconnect_peer(id)` on the server, after an optional reliable "reason" RPC to that peer.

## Disconnects

**Server, `peer_disconnected(id)`:**

- Free the peer's avatar on the server. The spawner removes it on clients.
- Erase the peer from `players`, any ready state and any ownership tables, and rebroadcast the table.
- If a match depends on the peer (a team empty, the host of a turn), decide on the server: pause, give it to an AI, or end the match.

**Client, `server_disconnected` and `connection_failed`:**

- Reset with `multiplayer.multiplayer_peer = OfflineMultiplayerPeer.new()`, clear the local player table, and return to a menu with a message.
- Stored node references may be freed by then, so check `is_instance_valid()` before using them.

**Timeouts.** ENet notices a dead peer only after its timeout (tens of seconds by default). On the server, tune it per peer with `peer.get_peer(id).set_timeout(timeout_ms, min_ms, max_ms)` on the `ENetPacketPeer`.

**Reconnecting** is a fresh connection with a **new peer id**. Map the returning player through the auth token (or account id), not the old peer id, and restore their state on the server. Godot has no built-in reconnect; retry `join()` a bounded number of times with a delay, and stop on the first `connected_to_server`.
