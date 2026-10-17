# Dedicated servers

Checked against the Godot 4.7 docs: "Exporting for dedicated servers", the export Resources options, the command-line tutorial and the feature tags page. The export preset itself belongs to the `godot-export` skill.

## Running headless

- Any Godot binary (editor or export template) runs without a window or audio when started with `--headless`. It uses dummy display, rendering and audio drivers.
- Detect it at run time with `DisplayServer.get_name() == "headless"`. There is **no** `headless` feature tag.
- `OS.has_feature("dedicated_server")` is true when the build was exported with the "Export as dedicated server" mode, or when `dedicated_server` is typed into the preset's Features tab. That tag also forces `--headless` when the exported project runs.

```gdscript
# Boot autoload: pick the role once, before any gameplay scene loads.
func _ready() -> void:
	if OS.has_feature("dedicated_server") or DisplayServer.get_name() == "headless":
		_start_server()
	else:
		_start_client()
```

The C# form is the same calls: `OS.HasFeature("dedicated_server")`, `DisplayServer.GetName()`.

## The server export preset

- Add a separate preset for the server (platform **Linux**; "Linux/X11" is Godot 3 wording).
- On its **Resources** tab, choose **Export as dedicated server**. It replaces visual resources (textures, meshes, materials, cubemaps, texture arrays and 3D textures) with placeholders that keep their references, so scenes still load and the PCK shrinks. Mark any visual resource the server really reads (for example a heightmap texture used for gameplay) as kept.
- A normal export of the same project works too, but it ships every asset and must be started with `--headless` by hand.
- Run the export from CI with `godot --headless --path . --export-release "Linux Server" build/server/game.x86_64`.
- **The client build is readable.** Anything in the client PCK, server-only scripts included, can be extracted. Keep secrets (API keys, anti-cheat rules worth hiding) out of client presets with export filters, or keep them on the server only. PCK encryption slows extraction but does not prevent it.
- C# servers: exports bundle the .NET runtime pieces they need, so the host does not need .NET installed. Ship the whole export folder.

## Server and client in one project

- Put server-only systems (match logic, AI, scoring) and client-only systems (camera, HUD, audio, input) in separate branches and disable the other branch: `client_systems.process_mode = Node.PROCESS_MODE_DISABLED` on the server, and the reverse on clients.
- A dedicated server is not a player: don't add id `1` to the player table, and let the first client (or a ready-up) start the match.
- With `--headless`, rendering already uses the dummy driver. Calling `RenderingServer.set_render_loop_enabled(false)` on the server is optional extra insurance.

## Configuration

Pass game arguments after `--` and read them with `OS.get_cmdline_user_args()`, so they never collide with engine options:

```
./game.x86_64 --headless -- --port 7777 --max-players 16 --tick-rate 30
```

```gdscript
# ServerConfig autoload, first in the autoload list.
var port := 7777
var max_players := 8
var tick_rate := 60

func _ready() -> void:
	_load_file("user://server.cfg")       # 1. config file over the defaults
	_apply_env()                          # 2. environment over the file (SERVER_PORT, ...)
	_apply_args(OS.get_cmdline_user_args())  # 3. command line over everything
	port = clampi(port, 1024, 65535)
	max_players = clampi(max_players, 1, 64)
	tick_rate = clampi(tick_rate, 10, 120)
	Engine.physics_ticks_per_second = tick_rate   # before the first physics frame

func _apply_args(args: PackedStringArray) -> void:
	var i := 0
	while i < args.size() - 1:
		match args[i]:
			"--port": port = args[i + 1].to_int()
			"--max-players": max_players = args[i + 1].to_int()
			"--tick-rate": tick_rate = args[i + 1].to_int()
		i += 1
```

`ConfigFile.load()` returns an error when the file is missing; keep the defaults then. Log the effective configuration once at startup.

## Match flow

Drive the session with one server-side state machine: `LOBBY -> COUNTDOWN -> IN_GAME -> RESULTS -> LOBBY`.

- Only the server changes state. It broadcasts each change with an `@rpc("authority", "call_local", "reliable")` method, and clients only display it.
- Drive timers from the server's `_physics_process` delta (or server-side `Timer` nodes) and send the end time, not a tick per second.
- Reset ready flags when returning to `LOBBY`. Refuse or spectate late joiners during `IN_GAME` (`multiplayer.multiplayer_peer.refuse_new_connections = true`).
- When the last player leaves, return to `LOBBY` or exit, so an orchestrator can recycle the process.

## Deployment

**Container.** The export binary needs glibc, so use a Debian or Ubuntu base rather than Alpine.

```dockerfile
FROM debian:bookworm-slim
RUN useradd --system --create-home game
WORKDIR /srv/game
# The whole export output: binary, .pck and any data folder.
COPY build/server/ ./
RUN chmod +x ./game.x86_64
USER game
EXPOSE 7777/udp
ENTRYPOINT ["./game.x86_64", "--headless", "--"]
CMD ["--port", "7777"]
```

Run it with `docker run -p 7777:7777/udp ...`. ENet is UDP, so publish the port with `/udp`. A WebSocket server is TCP, usually behind a TLS-terminating proxy.

**systemd.**

```ini
[Unit]
Description=Game server
After=network-online.target
Wants=network-online.target

[Service]
User=game
WorkingDirectory=/srv/game
ExecStart=/srv/game/game.x86_64 --headless -- --port 7777 --max-players 16
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

- Godot prints to stdout and stderr, which the journal captures: `journalctl -u game -f`.
- Open the UDP port in the host firewall and the cloud security group.
- Export the server with debug off for production, and keep a debug build for diagnosing crashes.
