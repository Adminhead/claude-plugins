# Batch godot-2b report

## Plugins created

| name | type | description (= plugin.json) | sources | deps |
| --- | --- | --- | --- | --- |
| godot-csharp | skill (direct install) | Writes and fixes C# in Godot 4 .NET projects: partial node classes, the PascalCase lifecycle, [Export], [Signal] events, GDScript interop, the .csproj and the build. Use for .cs or .csproj files beside project.godot, "port this GDScript to C#", GD0201 errors, or ObjectDisposedException after a signal. | awesome-gamedev-agent-skills `godot-csharp` @0a70cfc (Apache-2.0); GodotPrompter `csharp-godot`, `csharp-signals` @bd9d180 (MIT) | none |
| godot-multiplayer | skill (direct install) | Builds and secures networked Godot 4 games: server-authoritative @rpc validation, ENet and WebSocket peers, MultiplayerSpawner and MultiplayerSynchronizer, lobbies, dedicated servers, interpolation and prediction. Use for @rpc, "multiplayer", "netcode" or a headless server in a Godot project. | awesome-gamedev-agent-skills `godot-multiplayer` @0a70cfc (Apache-2.0); GodotPrompter `multiplayer-basics`, `multiplayer-sync`, `dedicated-server` @bd9d180 (MIT) | none |

Layout: each has `LICENSE` (Apache-2.0), `LICENSE-MIT` (GodotPrompter Contributors), `NOTICE` (Upstream/Paths lines in the required format), `skills/<name>/SKILL.md` + references, and 3 trigger evals (one hard negative each).

- godot-csharp: SKILL.md 139 lines; references `interop.md`, `signals.md`, `project-and-build.md`. Evals: GDScript-to-C# port (fires), ObjectDisposedException on custom signal (fires), ASP.NET Core async deadlock (hard negative).
- godot-multiplayer: SKILL.md 106 lines; references `replication-and-rpc.md`, `join-and-disconnect.md`, `sync-prediction.md`, `dedicated-server.md`. Evals: host-authoritative co-op rewrite (fires), Docker dedicated server (fires), local split-screen (hard negative).

## Validation

- `claude plugin validate --strict plugins/godot-csharp`: passed.
- `claude plugin validate --strict plugins/godot-multiplayer`: passed.
- grep for codegraph, claude-mem, coding-core:, github:, "Efficient ", old upstream skill names: none.
- Evals written, not run (`claude plugin eval` needs the plugins registered).

## Facts verified (Context7 /websites/godotengine_en_4_7 and the 4.7 migration page)

- GDScript reaches C# members by their C# (PascalCase) names; C# reaches GDScript with Get/Set/Call and snake_case names.
- C# signals: a custom [Signal] connected with `+=` and a capturing lambda are not auto-disconnected; `Connect(SignalName, Callable.From(method))` is.
- .NET: 8 minimum; Android export needs .NET 9 (since 4.5); no C# web export in Godot 4; Android/iOS experimental; exports bundle the runtime.
- 4.7 C# breaks: Animation.Length double (GH-116394), AccessibilityLive enum (GH-116839), RichTextLabel WidthUnit/ImageUnit (GH-112617), ImportFlags (GH-115788), TapBackPos removed (GH-114355), OptimizedTranslation.Generate bool (GH-119563).
- C# class spellings HttpRequest, Json (docs); GodotObject, GpuParticles2D from the godot-mcp addon SKILL.md.
- Multiplayer: @rpc defaults; set_multiplayer_authority does not replicate; delta_interval/replication_interval 0.0 = every network process frame; Object properties not syncable; spawn visibility follows synchronizers; get_spawnable_scene_count, spawn_limit, server_relay, refuse_new_connections, allow_object_decoding, auth handshake (peer_authenticating/send_auth/complete_auth/disconnect_peer); C# disconnect `Multiplayer.MultiplayerPeer = null`; same Godot version required on both ends.
- Dedicated server: dedicated_server tag from the export mode or Features tab (forces --headless); no `headless` feature tag; "Export as dedicated server" replaces visual resources with placeholders.
- godot-mcp addon tools (local ~/Projects/voidrot/godot-mcp SKILL.md): create_dotnet_project (net8.0 default), build_dotnet (one root csproj, Debug refreshes the editor), .cs create_script returns no diagnostics, validate_script is .gd only.

## Deviations

- godot-multiplayer has 4 references (design/review said 3): join and disconnect got its own file instead of bloating replication-and-rpc.md.
- godot-csharp has 3 references (review named signals.md + interop.md); project/build/export notes became `project-and-build.md`.
- Did not edit `godot/references/version-notes.md` (another batch's plugin); the 4.7 C# break list is in godot-csharp's body and should be copied there by the `godot` implementer or coordinator.
- Dropped GodotPrompter's EnableGodotDotNetPreview (not in the 4.7 migration guide), the ConnectOnce helper, the speed table, and its physics-fraction interpolation (wrong clock); rewrote request_spawn as a whitelisted spawner index.
- SKILL frontmatter has `license: Apache-2.0 AND MIT`.

## Unverified / TODO

- GD0001 as the missing-`partial` diagnostic id, `.godot/mono/temp/bin/Debug` as the build output (from the addon's issue notes), the desktop C# export "data folder" wording, and `server_relay`/`ENetPacketPeer.set_timeout` usage details were written from knowledge, not re-fetched.
- netfox is named as an example prediction addon with a "vet it yourself" caveat; not checked.
- Trigger evals not run.

## Follow-ups

- Register both in the marketplace as direct installs (not in godot-meta); add README acknowledgement rows if not already present.
- `recommend-plugins`: suggest godot-csharp on a `.csproj` beside `project.godot`, godot-multiplayer on `@rpc`/`MultiplayerSpawner`.
- Copy the 4.7 C# break list into `godot/references/version-notes.md`.
- Run the evals once registered, with `csharp` and `godot` installed, to check the godot-csharp vs csharp and godot-multiplayer vs godot boundaries.
