# Design: Godot and game-dev plugins

Status: proposal, 2026-10-17. Read-only design. No repo files were edited.

This revises the earlier verdict in `docs/research/inventory-2026-10-17/thirdparty-large.md` ("gamedev: skip, no new meta"). The user now wants Godot plugins under a `godot-meta`, plus engine-agnostic game-dev plugins. The case for porting instead of installing upstream directly: upstream's `godot` bundle adds 16 skill descriptions and `gamedev` adds 75. Merged ports cut that to 6 Godot plus 8 core descriptions, fix gaps (`.uid` sidecars, GUT and gdUnit4, the editor MCP), and keep the version pins in one place.

## 1. Summary

- **Sources:** awesome-gamedev-agent-skills is the spine (Apache-2.0, last commit 2026-10-09, good quality: about 120 to 180 lines per skill, concrete pitfalls, on-demand references). MIT merge sources: wshobson `godot-gdscript-patterns` (patterns reference), Qb-Lab `godot-scene-surgery` (`.tscn` rules, dated, fixed on port), and GodotPrompter `godot-testing` and `godot-debugging`. claude-skills `game-developer`, awesome-copilot `game-engine` and ECC add nothing.
- **Tooling:** the user's own `voidrot/godot-mcp` editor addon is the Godot MCP. It is per project (its port and token live in the project), so it gets a manual **setup skill** (`godot-mcp-setup`), not an MCP plugin. No third-party Godot MCP. No GDScript LSP plugin.
- **Godot plugins (8):** `godot` (core entry point), `godot-physics`, `godot-shaders`, `godot-export`, `godot-testing`, `godot-mcp-setup` (manual) in `godot-meta`; `godot-csharp` and `godot-multiplayer` as direct installs.
- **Engine-agnostic plugins (13):** `gamedev-core` holds `game-design`, `game-architecture`, `game-feel`, `level-design`, `game-ui`, `game-audio`, `game-performance`, `game-playtest`. Direct installs: `game-ai`, `game-genres`, `game-prototype`, `game-publish`, `game-assets`.
- **`godot-meta`** lists `programming-core`, `gamedev-core` and the 6 Godot plugins. Listing cost in a Godot project: 5 + 8 + 5 model-invoked descriptions (the setup skill is manual).
- **Version upkeep:** descriptions say "Godot 4" only; one `version-notes.md` in `godot` holds per-minor changes; the port records the upstream commit, so upkeep is a `git log <commit>..HEAD -- skills/godot` diff plus a grep check.
- **Implementation:** a metas batch, then 5 batches of 3 to 5 plugins: 21 focused plugins plus 2 deps-only plugins.

## 2. Source review

### 2.1 awesome-gamedev-agent-skills (`3rd-party/awesome-gamedev-agent-skills`)

| Aspect | Finding |
| --- | --- |
| License | Apache-2.0, with a `NOTICE` (Copyright 2026 Abhishek Barali and contributors; "all skills are original works authored from primary documentation"). Ports ship `LICENSE` and a `NOTICE` that names the source skills and states the modifications. |
| Freshness | Last commit 2026-10-09 (`0a70cfc`, Bevy 0.20 migration). `docs/VERSION-SUPPORT.md` checked 2026-09-25: Godot 4.7 (4.7.2), Godot .NET 4.7 + .NET 8. It has a stated quarterly review cadence. Active. |
| Quality | Uniform `When to use / Core workflow / Patterns / Pitfalls / References / Related skills` layout. Bodies are 117 to 188 lines; most skills have one 80- to 115-line reference. The pitfalls are the value (3.x to 4.x renames, deferred `change_scene_to_file`, `assert()` hanging a headless runner, COOP/COEP for threaded web exports). `godot-gdscript-headless-testing` says it was verified against 4.7.2. Code samples were not checked against the engine docs (theirs or ours); spot checks read correctly. |
| Gaps | No `.uid` sidecar files (Godot 4.4+) and no text-format `.tscn`/`.tres` editing rules (only `godot-resources` mentions `uid://`). No GUT or gdUnit4 (only a bare SceneTree runner). No game design docs, balancing or playtesting. Its genre and discipline skills are "build X" recipes, not design guidance. |
| Packaging | 10 upstream plugins, with a router skill that detects the engine. The router is not needed here: the project installs the meta for its engine. The 6 `agents/` dirs (Roblox and create-game-assets) are other-agent metadata; drop them. `create-game-assets/scripts/` (Pillow) is not run or ported. |
| Description length | Folded `>` descriptions of about 350 to 450 characters. The ports keep one description per merged plugin, under about 350 characters. |

Category verdicts:

| Category | Count | Verdict |
| --- | --- | --- |
| Godot | 16 | Port, merged into 7 plugins (see section 3). |
| Disciplines | 15 | Port, merged into 10 engine-neutral plugins. `shader-programming` goes into `godot-shaders` as a reference (see 3.1). |
| Genres | 9 | Port, merged into one `game-genres` skill with one reference per genre. |
| Workflows | 4 | `game-jam` + `prototype-fast` become `game-prototype`; `itch-publish` + `steam-publish` become `game-publish`. |
| Router | 1 | Skip. Engine choice comes from the installed meta. |
| Unity 8, Unreal 6, web engines 6, other engines 10 | 30 | Skip for now. Future: `unity-meta` and `unreal-meta` would reuse `gamedev-core` the way `godot-meta` does; Bevy fits beside `rust-meta`; the web engines (Phaser, PixiJS, three.js) could join `web-meta` users as direct installs. None of these 30 is engine-agnostic. |

### 2.2 Qb-Lab/godot-agent-skills

https://github.com/Qb-Lab/godot-agent-skills: MIT, 0 stars, last push 2026-09-17, plugin v0.3.0. It is a 20-skill workflow plugin (art direction, codex review, grill-me, write-plan, market scan, scope control, playtest review and so on) with 4 hooks (a PreToolUse scene-file guard in Python, UserPromptSubmit context injection, a Stop "require verify" hook and a SessionStart baseline). It was not cloned; its files were read through `gh api`.

| Item | Verdict | Reason |
| --- | --- | --- |
| `godot-scene-surgery` (5.5 KB) | merge (rules only) into `godot/references/tscn-tres-format.md` | Sound, conservative rules: prefer the editor, then a `@tool` script or `ResourceSaver.save()`, and hand edits last. ext_resource and sub_resource ids are strings and every `ExtResource()`/`SubResource()` must match a declared block. Never invent, copy or edit a `uid://`; to fix one, delete it and let the editor regenerate it. Fix `parent=`, `[connection]` and `NodePath`s on rename, and keep children after their parent. Don't hand-merge a `.tscn` conflict: take one side and redo the other change. Verify with `godot --headless --path . --quit`. It ends with an error-to-cause table. **Dated in places, fix when porting:** `load_steps` is deprecated and no longer written in 4.6+ (GH-103352). It misses the 4.6 per-node `unique_id` (GH-106837) and the `uid="uid://..."` attribute on `ext_resource` lines, and doesn't mention `.uid` sidecars (4.4+). |
| `godot4-api-guard` (4.8 KB), `godot-verify` (5.5 KB) | merge ideas | 3.x-to-4.x rename guard and "verify headless before claiming done" go into `godot` (version notes, a verify step). |
| `guard-scene-files.py` hook | skip | It contradicts its own skill: it denies any Edit containing `[node` or `uid://` (nearly every ext_resource line) and every Write to `.tscn`/`.tres`, including new files. It misses Bash `sed` edits, and its hooks.json leaves `${CLAUDE_PLUGIN_ROOT}` unquoted. A guard would also block the editor-MCP-free workflow the skill recommends. |
| The other 17 skills and 3 hooks | skip | Generic workflow (planning, grilling, review, handoff) that `programming-core`, `planning`, `the-fool` and `handoff` already cover, or per-prompt context injection that costs every turn. `loop-and-economy` and `playtest-review` are read as idea sources for `game-design` and `game-playtest` only. |

### 2.2a jame581/GodotPrompter (found during the tooling search)

https://github.com/jame581/GodotPrompter: MIT, 845 stars, last push 2026-10-14. A Claude and Cursor plugin with about 64 skills (`godot-testing`, `godot-debugging`, `gdscript-patterns`, `state-machine`, `save-load`, `multiplayer-*`, `beehave`, `limboai`, `phantom-camera`, `xr-development` and more), targeting Godot 4.3+ with GDScript and C# side by side. Two were sampled. `godot-testing` has a useful GUT versus gdUnit4 comparison, directory and naming conventions, and CI runners. `godot-debugging` covers print functions, the debugger, signal tracing and common errors. The descriptions are short "Use when ..." lines, and 64 of them would crowd the listing. **Verdict:** don't cross-depend on it (mega-plugin, plan decision 2). Use `godot-testing` and `godot-debugging` as MIT merge sources for `godot-testing` and a new `godot/references/debugging.md`, after rechecking the facts (for example, its `print_debug()` note). Its addon-specific skills (`beehave`, `limboai`, `phantom-camera`, `dialogue-manager`) are a future option for direct installs.

### 2.3 Other local candidates

| Source | Item | Verdict | Reason |
| --- | --- | --- | --- |
| `3rd-party/wshobson-agents/plugins/game-development/skills/godot-gdscript-patterns` (MIT) | 78-line SKILL.md plus 739 lines of references: state machine, autoload event bus, Resource data, object pooling, health/hitbox/hurtbox components, scene manager, save manager | merge | Its SKILL.md is generic ("Master Godot 4 GDScript patterns", "learning best practices"). The worked patterns are good Godot 4 code. Condense them into `godot/references/patterns.md` (about 150 lines; pooling and components are the useful ones), and its save manager into `godot/references/save-and-config.md`. MIT attribution in `godot`'s NOTICE. |
| wshobson `game-development` agents (`unity-developer`, `minecraft-bukkit-pro`) | 2 | skip | Persona agents, off-engine (plan decision: no wshobson persona agents). |
| wshobson `unity-ecs-patterns` | 1 | skip | Unity. Future `unity-meta` option. |
| `3rd-party/claude-skills/skills/game-developer` (MIT) | 166 lines plus Unity, Unreal, ECS, networking and performance references | skip | Persona skill aimed at Unity and Unreal ("verify frame time ≤16 ms before proceeding"). Its `ecs-patterns.md` and `performance-optimization.md` add nothing over upstream disciplines. Already skipped in the earlier review. |
| `3rd-party/awesome-copilot/skills/game-engine` (MIT) | 139 lines, HTML5 Canvas and WebGL from scratch, MDN-derived references | skip | Web-from-scratch games, a broad description that would over-trigger in every game repo, and nothing Godot-specific. |
| `3rd-party/ECC` | none | n/a | No Godot or game skill found. |

### 2.4 Tooling

**Godot MCP: use the user's addon.** Per the coordinator, the Godot MCP is the user's own `voidrot/godot-mcp` (details and the setup design in 3.4). Third-party Godot MCP servers were not evaluated and are dropped.

**GDScript LSP: skip.**

- `lspServers` is stdio only in practice. The plugins reference says "`transport`: `stdio` (default) or `socket`. Claude Code accepts `socket` but runs every server over stdio". There is no host or port field, so reaching the editor's LSP on TCP 6005 needs a stdio-to-TCP bridge as `command`.
- A plugin already exists: Sods2/claude-code-gdscript-lsp (MIT, 7 stars, last push 2026-03-15). It is a roughly 200-line Node bridge installed with `npm link`, so it is unpinned and not in any marketplace. Other bridges are code-xhyun/godot-lsp-stdio-bridge (MIT, 2026-02) and Pixel-Directive-LLC/godot-lsp-bridge (Rust, MPL-2.0). kurushimee/gdls (MIT, 2026-10-13) is a standalone GDScript LSP that needs no Godot, but it is days old.
- Neither claude-code-lsps marketplace (Piebald-AI, boostvolt) has a GDScript entry.
- **Why skip:** the editor LSP needs a running editor, which is the same precondition as the godot-mcp addon. The addon already returns parse diagnostics from `create_script`, `edit_script` and `validate_script`, and runtime diagnostics from `run_headless`. Without an editor, `godot --headless --path . --quit` or `--check-only` gives a cheap check. The bridge adds an npm-linked binary, plus a port-6005 conflict: the addon's own plan notes that a GUI editor holding 6005 breaks a second headless `--import`.
- **Future option:** revisit `gdls` once it matures, or if a pinned bridge lands in `claude-code-lsps`. It would then be a `gdscript-lsp@claude-code-lsps` cross-dep in `godot-meta`, like `pyright` for Python.

**Claude Code facts for the MCP design** (from code.claude.com/docs/en/mcp and plugins-reference):

- `headersHelper` is supported for http, sse and ws servers. It must print a JSON object of strings. It has a 10 s timeout, runs on every connect, and is re-run once on a 401 or 403. That matches the addon's per-load token rotation.
- `${user_config.KEY}` is substituted in plugin MCP config; the http fields that expand `${...}` are `url`, `headers` and `headersHelper`. However, "a plugin-provided `headersHelper` can't reference the plugin's `${user_config.*}` values" (since v2.1.207). A plugin entry could therefore set `url` from a `port` option, but `userConfig` is one value per install, not per Godot project. Confirm the `url` substitution with `claude plugin validate` if the plugin option is ever built.

**Testing frameworks (for `godot-testing`):**

| Tool | Version | Supports | Source |
| --- | --- | --- | --- |
| Godot | 4.7.2 stable (2026-08-18); 4.8 in dev | n/a | MIT |
| GUT | 9.7.1 (2026-07-10), for 4.7.x; 9.6.1 for 4.6, 9.5.0 for 4.5 | 9.7.0 breaking change: doubles return typed defaults | bitwes/Gut, MIT |
| gdUnit4 | v6.2.2 (2026-10-07), for 4.5 to 4.7.1; v5.x for 4.3 to 4.4 | headless CLI runner scripts; GitHub Action `godot-gdunit-labs/gdUnit4-action` v1.3.2 | godot-gdunit-labs/gdUnit4, MIT |

## 3. Proposed plugins

Type: S skill, S-manual (`disable-model-invocation: true`, no listing cost). "Upstream" means awesome-gamedev-agent-skills at commit `0a70cfc`; paths are relative to its `skills/`. Size targets are SKILL.md lines plus references.

### 3.1 Split rule

- **Godot API lives only in `godot-*` plugins.** Every version-sensitive fact (node names, method signatures, `project.godot` keys, CLI flags) is in the Godot family, so version upkeep touches one family. `gamedev-core` skills carry no engine versions. Where they need an engine example, they point at the engine skill ("for the Godot API see the `godot` skill").
- **A Godot topic gets its own plugin only when it has deep API, its own file types or its own trigger:** physics bodies and controllers, `.gdshader`, export and CI, testing frameworks, C#, networking. Thinner topics (animation, audio buses, Control UI, InputMap, TileMapLayer, 3D scene setup, save files) are references of `godot` and are loaded on demand. One Godot entry point avoids "build a HUD in Godot" firing three skills.
- **Design and API are layered, not duplicated.** "Make the jump feel better in Godot" can load `game-feel` (coyote time, buffering, variable jump height, why) and `godot-physics` (the CharacterBody2D code). The descriptions draw the line: `game-*` is technique and design; `godot-*` is engine API.
- **The editor addon's own skill wins for editor operations.** When the project has the `godot-editor` MCP server, the addon has installed `<project>/.claude/skills/godot-mcp/SKILL.md`. Our skills never repeat its tool table. They say once, in `godot`'s body: "If `godot-editor` tools are available, follow the project's `godot-mcp` skill for editor work: scene and node edits with undo, `save_scene`, `run_headless` diagnostics, `build_dotnet`. Don't hand-edit a `.tscn` the editor has open, because the editor overwrites it on save. Without the server, edit files and run `godot --headless`."

### 3.2 Godot plugins

| Plugin | Type | Job | Trigger boundary | Sources and merges | Size target | Attribution | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `godot` | S | Entry point for any Godot 4 project work: GDScript 2.0 (typing, annotations, lifecycle, `await`), scene composition and instancing, autoloads, signals and groups, custom Resources, `project.godot`, safe text edits to `.tscn`/`.tres` with `uid://` and `.uid` sidecars, 3.x to 4.x porting, and routing to the editor MCP skill. References load per topic. | Fires on `.gd`, `.tscn`, `.tres`, `project.godot` or "Godot". Hands off: bodies and movement to `godot-physics`, `.gdshader` to `godot-shaders`, export to `godot-export`, tests to `godot-testing`, `.cs` to `godot-csharp`, `@rpc` to `godot-multiplayer`. | Upstream `godot-gdscript`, `godot-nodes-scenes`, `godot-signals-groups`, `godot-resources` (body); references from `godot-animation`, `godot-audio`, `godot-ui-control`, `godot-tilemap`, `godot-3d-essentials`; wshobson patterns; Qb-Lab `godot-scene-surgery` rules (2.2, updated for 4.6); GodotPrompter `godot-debugging` (as `debugging.md`); new `version-notes.md`, `tscn-tres-format.md`, `input-map.md`, `save-and-config.md`, `performance.md` (Godot profiler and monitors). | Body ≤ 180 lines. References: `gdscript.md`, `scenes-and-resources.md`, `signals-groups.md`, `tscn-tres-format.md`, `patterns.md`, `animation.md`, `audio.md`, `ui-control.md`, `input-map.md`, `tilemap.md`, `3d-scene.md`, `save-and-config.md`, `performance.md`, `debugging.md`, `version-notes.md`, each ≤ 150 lines. | Apache-2.0 (LICENSE, NOTICE), MIT for wshobson, Qb-Lab and GodotPrompter: ship `LICENSE-MIT` too, naming each. | port (merge 7 + 2) |
| `godot-physics` | S | Movement and collision in 2D and 3D: CharacterBody controllers (platformer, top-down, 3D), `move_and_slide` and floor and slope handling, Rigid, Static and Area bodies, layers versus masks, raycasts and space-state queries, physics interpolation and jitter, tunneling. | Physics nodes, controllers, collisions, "falls through floor", "jitters". Feel tuning without engine code goes to `game-feel`. | Upstream `godot-2d-movement`, `godot-physics` (+ their references); the Godot-side parts of `disciplines/physics-tuning` (interpolation, CCD). | ≤ 170 + 2 references (`controllers.md`, `queries.md`). | Apache-2.0 | port (merge 2) |
| `godot-shaders` | S | Godot Shading Language: `canvas_item`, `spatial` and `particles` shaders, uniforms and hints, `TIME`/`UV`, screen-reading, visual shaders, materials, and the common effects (dissolve, outline, rim, scroll). Shader fundamentals (spaces, UV math, GLSL and HLSL mapping) as a reference. | `.gdshader`, `ShaderMaterial`, "write a shader" in a Godot project. | Upstream `godot-shaders` + `disciplines/shader-programming` (as `references/fundamentals.md`). | ≤ 150 + 2 references. | Apache-2.0 | port (merge 2) |
| `godot-export` | S | Export templates, `export_presets.cfg`, headless CLI exports (`--export-release`), web COOP/COEP and threads, Android keystores, macOS signing, dedicated-server builds, a CI export job. | "export", "build for Windows/Web/Android", preset errors. Store upload goes to `game-publish`. | Upstream `godot-export` (+ reference). | ≤ 140 + 1 reference. | Apache-2.0 | port |
| `godot-testing` | S | Godot tests: pick GUT, gdUnit4 or a bare SceneTree runner from what the project has; write tests; run headless with `--import` first; exit codes, hangs and timeouts; a CI job. Also how `run_headless` from the editor MCP fits. | "test", `test_*.gd`, `addons/gut`, `addons/gdUnit4`, CI for a Godot project. General TDD stays in `unit-testing`. | Upstream `godot-gdscript-headless-testing`; GodotPrompter `godot-testing` (framework choice, layout, CI); `references/gut.md` (GUT 9.7.x for 4.7) and `references/gdunit4.md` (v6.2.x, gdUnit4-action) checked against the official docs, versions only in the references. | ≤ 170 + 2 references. | Apache-2.0, MIT (GodotPrompter) | port + merge |
| `godot-mcp-setup` | S-manual | `/godot-mcp-setup`: install the latest `voidrot/godot-mcp` addon into the project, enable it, connect Claude Code through the project's `.mcp.json`, and refresh the addon's own skill. See 3.4. | Manual only. `godot` mentions it when the user asks to connect Claude to the editor. | New. | ≤ 120 lines, plus a `scripts/install-addon.sh`. | MIT, own work (the addon is the user's, MIT). | new |
| `godot-csharp` | S | Godot .NET: `partial` classes, PascalCase lifecycle, `[Export]`, `[Signal]` delegates, node lookup, C# and GDScript interop, `.csproj` and the build, C# pitfalls (the engine's C# class spellings, GC in `_Process`). Defers to the MCP skill for `create_dotnet_project` and `build_dotnet`. | `.cs` or `.csproj` in a Godot project. | Upstream `godot-csharp` (+ reference). | ≤ 160 + 1 reference. | Apache-2.0 | port; direct install |
| `godot-multiplayer` | S | High-level multiplayer: ENet and WebSocket peers, `@rpc` modes, authority, `MultiplayerSpawner` and `MultiplayerSynchronizer`, server-authoritative checks, dedicated server, lag basics. | `@rpc`, "multiplayer", "netcode" in a Godot project. | Upstream `godot-multiplayer` (+ reference). | ≤ 150 + 1 reference. | Apache-2.0 | port; direct install |

### 3.3 Engine-agnostic plugins

| Plugin | Type | Job | Trigger boundary | Sources and merges | Size target | Attribution | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `game-design` | S | Game design documents and design decisions: pillars, core loop, one-page pitch, mechanic and system specs, progression, economy and balancing (curves, sinks and faucets, spreadsheet or script simulation, drop tables), difficulty, scope cuts. | "GDD", "design doc", "core loop", "balance", "economy", "progression", "too hard". Building a mechanic goes to engine skills; genre norms to `game-genres`. | New (authored), plus loot tables from upstream `procedural-gen` and the balancing sections of `genres/tower-defense` and `genres/rpg`. | ≤ 150 + 3 references (`gdd-template.md`, `balancing.md`, `economy.md`). | Apache-2.0 for the upstream parts. | new + merge |
| `game-architecture` | S | Code structure for games, any engine: the loop and fixed versus variable timestep, state machines (game, player, AI), composition versus inheritance, event bus, object pools, data-driven content, scene or screen flow, and save systems (what to serialize, atomic writes, schema versions, autosave). | "how should I structure", "state machine", "save system", "game loop". Engine API goes to the engine skill. | Upstream `disciplines/save-systems`, the timestep half of `physics-tuning`; new loop and state-machine sections. | ≤ 140 + 2 references (`save-systems.md`, `patterns.md`). | Apache-2.0 | port + new |
| `game-feel` | S | How control feels: input buffering, coyote time, variable jump height, deadzones, action mapping and rebinding, camera follow (deadzone, look-ahead, smoothing, bounds, shake), juice (hit-stop, tweens, squash and stretch, knockback, layered feedback), physics feel and jitter. | "feels floaty", "juice", "camera", "controls", "rebinding". Engine code goes to `godot-physics` or `godot`. | Upstream `disciplines/game-feel`, `camera-systems`, `input-systems`, the feel half of `physics-tuning`. | ≤ 170 + 3 references (`camera.md`, `input.md`, `juice.md`). | Apache-2.0 | port (merge 4) |
| `level-design` | S | Levels: blockout to playable, player metrics and grid, pacing and tension curves, gating and critical path, encounters, readability; procedural generation (seeded RNG, noise, rooms and corridors, BSP, random walk). | "level design", "blockout", "pacing", "procedural dungeon". Tile and GridMap API goes to `godot`. | Upstream `disciplines/level-design`, `procedural-gen` (generation half). | ≤ 140 + 2 references (`pacing-encounters.md`, `procgen.md`). | Apache-2.0 | port (merge 2) |
| `game-ui` | S | Game UI and UX: HUD, menus and overlays, a menu state stack, resolution and aspect scaling, safe areas, keyboard and gamepad focus navigation, event-driven HUD updates, settings screens, and game accessibility (subtitles, remapping, colour, motion). | "HUD", "menu", "pause screen", "UI scaling", "gamepad navigation" in a game. Web or app UI goes to `design-core`. Control-node API goes to `godot`. | Upstream `disciplines/game-ui-ux`; new accessibility reference (from the Game Accessibility Guidelines, cited, not copied). | ≤ 150 + 2 references. | Apache-2.0 | port + new |
| `game-audio` | S | Game audio practice: bus and mixer layout, gain in dB, ducking, adaptive music (layers, stems, transitions), SFX variation and voice limits, beat sync, loudness targets. | "audio mix", "music transitions", "ducking", "SFX". Bus and player API goes to `godot`. | Upstream `disciplines/audio-design`. | ≤ 140 + 1 reference. | Apache-2.0 | port |
| `game-performance` | S | Measure-first frame budgets: profile a release build on the target, the CPU versus GPU split, draw calls and batching, overdraw, allocations and GC hitches, pooling, asset and memory budgets, and a regression check. | "low FPS", "stutter", "hitches", "frame budget". Godot profiler specifics are in `godot/references/performance.md`. Non-game code goes to `problem-solving`. | Upstream `disciplines/performance-optimization`. | ≤ 150 + 1 reference. | Apache-2.0 | port |
| `game-playtest` | S | Playtests: what to learn, a session script and observer notes, think-aloud, first-time-user tests, metrics and lightweight telemetry, surveys, turning feedback into ranked changes, and fun and keep-or-kill criteria for a build. | "playtest", "feedback from testers", "is it fun". Code QA goes to `godot-testing`. | New (authored). | ≤ 140 + 2 references (`session-kit.md`, `telemetry.md`). | Own work. | new |
| `game-ai` | S | NPC and enemy decisions: FSM, behavior trees, utility AI, steering and flocking, A* and navigation meshes in concept, perception, difficulty knobs. | "enemy AI", "behavior tree", "pathfinding". Godot `NavigationAgent` API goes to `godot`. | Upstream `disciplines/game-ai` + `ai-behavior-trees-utility-ai` (its 839 reference lines trimmed to about 250). | ≤ 160 + 3 references. | Apache-2.0 | port (merge 2); direct install |
| `game-genres` | S | Genre references, one file each: platformer, roguelike, card game, puzzle, RPG, FPS, tower defense, survival-crafting, visual novel, plus dialogue systems (Ink, Yarn Spinner, custom runners) shared by RPG and VN. The body routes by genre and lists what every genre build needs first. | "make a roguelike/platformer/deckbuilder...". One description replaces nine. | Upstream `genres/*` (9) + `disciplines/dialogue-systems`. | Body ≤ 80; 10 references ≤ 130 each. | Apache-2.0 | port (merge 10); direct install |
| `game-prototype` | S | Timeboxed builds: an hour-long prototype that answers one question with keep or kill criteria, and game-jam planning (scope to the clock, hour schedule, cut list, submit early). | "prototype a mechanic", "game jam", "48 hours". The repo's `prototype` skill stays for web UI and state-model demos. | Upstream `workflows/prototype-fast`, `workflows/game-jam`. | ≤ 140. | Apache-2.0 | port (merge 2); direct install |
| `game-publish` | S | Ship a build to a store: itch.io with butler channels and versions, Steam with SteamPipe depots, `app_build.vdf`, steamcmd, branches and the release checklist. | "publish to Steam/itch", "butler push", "steamcmd". Building the export goes to `godot-export`. | Upstream `workflows/itch-publish`, `workflows/steam-publish` (+ references). | ≤ 160 + 2 references. | Apache-2.0 | port (merge 2); direct install |
| `game-assets` | S | Art direction for game assets: a style bible, palette and scale rules, sprite, tileset, UI and icon specs, an asset manifest and naming, sourcing with licenses, and import checks. | "art style", "sprites", "tileset", "asset list". Web UI visuals go to `ui-direction`. | Upstream `disciplines/create-game-assets` without its Pillow `scripts/` and `agents/`. | ≤ 130 + 2 references. | Apache-2.0 | port (trimmed); direct install, low priority |

### 3.4 `godot-mcp-setup` and the editor MCP

Facts from `~/Projects/voidrot/godot-mcp` (read-only; MIT; to be published as github.com/voidrot/godot-mcp; installs track the latest default branch):

- v1 is a GDScript editor addon, `addons/godot_mcp/` (plugin.cfg version 0.1.0), that is itself the MCP server: Streamable HTTP at `http://127.0.0.1:<port>/mcp`. The port is chosen from 6550 to 6649 on first load and saved as `godot_mcp/server/port` in `project.godot`.
- Auth is a bearer token regenerated on every plugin load, at `res://.godot/godot_mcp/headers.json` (`.godot/godot_mcp/.gitignore` is `*`). The `.mcp.json` entry reads it at connect time through `headersHelper`, and the install sets `timeout` to 600000 ms.
- Project > Tools > "MCP: install agent skill / show config", or the `install_agent_skill` tool, writes `<project>/.claude/skills/godot-mcp/SKILL.md` (with a `metadata.godot_mcp: "true"` marker) and shows the entry. It never writes `.mcp.json`. It is POSIX only.
- 24 tools: project info and settings, scene tree, open, create and save scenes, node CRUD and properties with undo, script read, create, edit and validate (including `.cs`), editor log, play and stop, `import_assets`, `run_headless`, `build_dotnet`, `create_dotnet_project`. No screenshots, no execute-GDScript tool. The bearer token is the only boundary: `@tool` scripts and setters run project code, so it is for trusted projects only.
- Headless service mode works: `godot --headless --editor --path <project>`.
- The repo has no `LICENSE` file yet. The Bun stdio server in `src/` is v0 and being retired.

**Why a setup skill and not an MCP plugin.** A plugin `.mcp.json` names one URL for every project where the plugin is enabled. The addon's port differs per project (two editors open at once need two ports), and `userConfig` values are stored per install, not per Godot project (see 2.4 for what the docs say). The token path is project-relative, and the addon already builds the right entry. A project `.mcp.json` written once per project fits all of that. A plugin would also rename the server to `plugin:<name>:godot-editor`, so tool names would no longer match what the addon's skill and instructions say. Option kept for later: a `godot-editor-mcp` plugin with a `port` `userConfig` defaulting to 6550, for users who pin every project to one port and open one editor at a time.

**`/godot-mcp-setup` steps** (manual skill, confirm before each write):

1. Check the project: `project.godot` exists, its `config/features` version is 4.7 or later (the addon targets 4.7), POSIX host, `godot` on `PATH` (or `GODOT` env), and coreutils `timeout` on `PATH` (the addon's job tools need it).
2. Install or update the addon: download `https://codeload.github.com/voidrot/godot-mcp/tar.gz/HEAD` (default branch) into a new empty temp dir, extract, and copy only `addons/godot_mcp/` into the project (replace an older copy after showing the plugin.cfg version change). Never run anything from the tarball. Record the commit (`git ls-remote https://github.com/voidrot/godot-mcp HEAD`) in the report.
3. Enable it: add `res://addons/godot_mcp/plugin.cfg` to `[editor_plugins] enabled=PackedStringArray(...)` in `project.godot`, preserving existing entries.
4. Get a port: if `godot_mcp/server/port` is missing, start the editor once (`timeout 60 godot --headless --editor --path . ` until the log prints `godot_mcp: serving http://127.0.0.1:<port>/mcp`), or ask the user to open the project in the editor. Read the port back from `project.godot`.
5. Write `.mcp.json` (merge, never clobber other servers) with `{"godot-editor": {"type": "http", "url": "http://127.0.0.1:<port>/mcp", "headersHelper": "cat .godot/godot_mcp/headers.json", "timeout": 600000}}`. The relative path works because Claude Code runs `headersHelper` with the project dir as cwd; fall back to the absolute shell-quoted path that the addon's dialog prints if the user launches Claude from elsewhere. This is the one place we deviate from the addon's "setup never writes `.mcp.json`"; the user approves the diff.
6. Install the addon's skill: tell the user to run Project > Tools > "MCP: install agent skill / show config" (or, once connected, call `install_agent_skill`). Our plugin never copies that SKILL.md itself, so the installed copy always matches the addon version.
7. Tell the user to approve the project MCP server, restart or `/mcp` reconnect, then check `get_project_info`. After an addon update, rerun step 6.
8. Remind: commit `addons/godot_mcp/`, `.mcp.json` and `.claude/skills/godot-mcp/`; `.godot/` stays ignored.

**Dropped:** third-party Godot MCP servers (the user has their own), and the GDScript LSP bridge (2.4).

## 4. Dependency lists

### `gamedev-core` (core bundle)

```json
"dependencies": [
  "game-design",
  "game-architecture",
  "game-feel",
  "level-design",
  "game-ui",
  "game-audio",
  "game-performance",
  "game-playtest"
]
```

Listed by `godot-meta` now and by future `unity-meta`, `unreal-meta` or `bevy` sets. A core bundle needs several metas to justify it; with one meta today it is still worth creating, because it is the stated cross-engine set and costs nothing extra.

### `godot-meta` (project scope)

```json
"dependencies": [
  "programming-core",
  "gamedev-core",
  "godot",
  "godot-physics",
  "godot-shaders",
  "godot-export",
  "godot-testing",
  "godot-mcp-setup"
]
```

- **`programming-core`: yes.** A Godot project is a code project. `coding`, `problem-solving` and `planning` apply as-is; `unit-testing` gives the TDD discipline that `godot-testing` gives the runner for. Follow-up: teach `test-run`'s runner detection about Godot (GUT, gdUnit4 and the `godot --headless --script` runner), or it reports "no runner found".
- **No LSP dependency** (2.4).
- **Direct installs:** `godot-csharp` (C# projects only), `godot-multiplayer` (networked games only), `game-ai`, `game-genres`, `game-prototype`, `game-publish`, `game-assets`. `recommend-plugins` should propose `godot-csharp` when it sees a `.csproj` beside `project.godot`, and `godot-multiplayer` on `@rpc` or `MultiplayerSpawner`.

## 5. Skips

| What | Why |
| --- | --- |
| Upstream `router` | The meta picks the engine; the router would add a broad description to every game repo. |
| Unity (8), Unreal (6), web engines (6), Bevy, pygame, LÖVE, Roblox (10) | Off-scope for now; none is engine-agnostic. Future metas reuse `gamedev-core`. |
| `create-game-assets` scripts and every upstream `agents/` dir | Pillow scripts we won't run or maintain; other-agent metadata. |
| claude-skills `game-developer`, awesome-copilot `game-engine`, wshobson game agents and `unity-ecs-patterns` | Persona or off-engine content, broad triggers; nothing beyond upstream (2.3). |
| Third-party Godot MCP servers | Replaced by the user's `voidrot/godot-mcp`. |
| A `gdscript-lsp` plugin | See 2.4. |
| An MCP plugin for `godot-editor` | Per-project port and token; a project `.mcp.json` from `godot-mcp-setup` fits (3.4). |
| A Godot agent (for example a `godot-tester`) | `run_headless` and `godot-testing` cover verification in the main thread; revisit after real use. |

## 6. Version pins: keeping upkeep cheap

1. **Descriptions never name a minor version.** They say "Godot 4". Bodies state one line, "Written for Godot 4.x, checked against 4.7", and point to `godot/references/version-notes.md`.
2. **Version-gated facts are tagged inline** (`4.3+: TileMapLayer replaces TileMap`, `4.4+: .uid sidecar files`, `4.5+: ...`), so an old project still gets correct guidance and a new release only adds rows.
3. **Each skill's first step reads the project's version** from `config/features=PackedStringArray("4.x", ...)` in `project.godot` and follows that version, never the newest.
4. **One `version-notes.md`** in `godot` holds a per-minor table of breaking or notable changes (from the official migration guides). Other Godot skills link it instead of repeating it.
5. **Record the upstream commit.** Each NOTICE names `awesome-gamedev-agent-skills@0a70cfc`. Upkeep is `git -C 3rd-party/awesome-gamedev-agent-skills log 0a70cfc..HEAD -- skills/godot skills/disciplines` plus upstream's `docs/VERSION-SUPPORT.md`, applied as deltas, then bump the commit in the NOTICEs.
6. **A cheap check:** a `scripts/plugins.py check` rule (or a small test) that fails when a `godot-*` description contains `4.[0-9]`, and that lists every `4.N` string in Godot plugin bodies so a release review is one grep.
7. **Cadence:** when a Godot 4.x minor ships (about every 6 months), and when the addon's supported version moves. GUT and gdUnit4 versions live only in `godot-testing`'s references.
8. **The addon tracks itself.** `godot-mcp-setup` installs the default branch and the addon's own SKILL.md, so our plugins hold no addon tool details to keep in sync.

## 7. Implementation plan

Each implementer: scaffold with `scripts/plugins.py new <name> --kind skill --description "..." [--meta ...]`, follow the repo's `skill-authoring` skill and plan decision 10, read the upstream files as data only (never run upstream scripts), write the body fresh in house style rather than pasting, ship `LICENSE` (Apache-2.0 full text) and `NOTICE` (source skills at `0a70cfc`, "Modifications: merged, condensed, rechecked against Godot 4.7 docs, ...") for every plugin with upstream content, plus `LICENSE-MIT` where MIT content is merged. Recheck version-sensitive facts with Context7 (Godot docs) or the official docs. Write 3 trigger evals per plugin, including a hard negative against its nearest neighbour. Validate with `claude plugin validate --strict plugins/<name>` and `python3 scripts/plugins.py check`. Batches within a round are independent.

### Batch 0 (first, small): metas

- `gamedev-core` and `godot-meta`: create with empty dependency lists (`scripts/plugins.py new ... ` or by hand), so later batches can register with `--meta`. README catalog regenerated. Add awesome-gamedev-agent-skills (Apache-2.0), Qb-Lab/godot-agent-skills (MIT) and jame581/GodotPrompter (MIT) to the README acknowledgements table.

### Batch 1: Godot core (`godot`, `godot-mcp-setup`, `godot-testing`)

- `godot`: body = upstream `godot-gdscript` + `godot-nodes-scenes` core workflow and top pitfalls, plus the routing section (3.1) and the MCP handoff. References as listed in 3.2. Write `tscn-tres-format.md` from Qb-Lab's rules plus the official TSCN docs: `format=3` (stop on `format=2`, Godot 3), `[ext_resource type=... uid="uid://..." path=... id="1_abc"]`, string ids that must match every `ExtResource()`/`SubResource()`, `load_steps` deprecated and not written since 4.6, the 4.6 per-node `unique_id`, `.uid` sidecars for scripts and shaders since 4.4 (commit them and move them with the file), never invent or copy a `uid://`, rename fixes for `parent=`, `[connection]` and NodePaths, no hand merges, verify with `godot --headless --path . --quit`, and prefer the MCP tools while the editor has the scene open. Recheck whether 4.x still writes `format=4` for some files before mentioning it. `version-notes.md` new. Hard negatives: a Unity C# prompt, a `.gdshader` prompt (goes to `godot-shaders`).
- `godot-mcp-setup`: `disable-model-invocation: true`. `scripts/install-addon.sh <project-dir>`: `mktemp -d`, curl the default-branch tarball, `tar -x` into the temp dir, copy only `addons/godot_mcp/`, print the plugin.cfg version and the commit. No `.mcp.json` write in the script; the skill edits `.mcp.json` with Edit after showing the diff. Test the script against a throwaway project with a local tarball (`file://` or `GODOT_MCP_TARBALL` override) and, if `godot` is installed, the headless port step.
- `godot-testing`: body from upstream headless testing (keep its verified runner pattern and the `--import` and `assert()` pitfalls); add framework detection (`addons/gut`, `addons/gdUnit4`), GodotPrompter's GUT versus gdUnit4 table (GUT for GDScript-only, gdUnit4 for C# or scene runners), and `references/gut.md` (`gut_cmdln.gd`; 9.7.0 typed-default doubles) and `references/gdunit4.md` (CLI runner scripts, `gdUnit4-action`), with versions only inside the references.

### Batch 2: Godot specialised (`godot-physics`, `godot-shaders`, `godot-export`, `godot-csharp`, `godot-multiplayer`)

- `godot-physics`: merge `godot-2d-movement` + `godot-physics`; add physics interpolation (4.3+ 2D, 4.4+ 3D; verify) and Jolt as the 3D default if 4.x made it so (verify against the 4.7 docs before writing).
- `godot-shaders`: `shader-programming` becomes `references/fundamentals.md`; drop its HLSL-heavy parts to a short mapping table.
- `godot-export`: port; check the CLI flags (`--export-release`, `--export-pack`, `--headless`) and the web threads options against 4.7.
- `godot-csharp`: port; .NET version from the project's `.csproj`; point at the MCP skill for `create_dotnet_project` and `build_dotnet` and note the engine's C# class spellings (`GodotObject`, `GpuParticles2D`, `HttpRequest`).
- `godot-multiplayer`: port; keep server-authority validation front and centre.

### Batch 3: gamedev-core part 1 (`game-feel`, `level-design`, `game-architecture`, `game-performance`)

- `game-feel`: four upstream sources into one body with three references; strip engine API to pointers.
- `level-design`: `procgen.md` from `procedural-gen` (keep seeded RNG and determinism rules); loot tables go to `game-design` in batch 4.
- `game-architecture`: `save-systems` as a reference; the loop and timestep section from `physics-tuning`; keep it short, since the model already knows the basics. Its value is the pitfalls.
- `game-performance`: port; Godot-specific profiler notes go to `godot/references/performance.md` (coordinate with batch 1, or add in a follow-up).

### Batch 4: gamedev-core part 2 (`game-design`, `game-ui`, `game-audio`, `game-playtest`)

- `game-design` and `game-playtest` are new writing. Use the `research` skill for sources (GDC talks, published design books are cited, not copied). Keep them procedural: templates, checklists and the questions to ask, not essays.
- `game-ui`: port `game-ui-ux`; add an accessibility reference built from the Game Accessibility Guidelines (CC-licensed site; cite, paraphrase).
- `game-audio`: port.

### Batch 5: direct installs (`game-ai`, `game-genres`, `game-prototype`, `game-publish`, `game-assets`)

- `game-genres`: one router body and ten references; each reference keeps "core systems, data model, feel targets, balancing norms, pitfalls" and drops engine code to pointers.
- `game-ai`: trim the BT and utility AI references hard (839 lines to about 250).
- `game-publish`: recheck steamcmd and butler commands against current docs.
- `game-assets`: low priority; drop the scripts; can be cut if the batch runs long.

After the batches: add the Godot detection to `test-run` and the `.csproj` and `@rpc` hints to `recommend-plugins` (one small follow-up), run the trigger evals with the full `godot-meta` installed to check the layered pairs (`game-feel` with `godot-physics`, `game-ui` with `godot`), and update `docs/plans/plugin-adoption.md` with a decision 11 replacing the "game dev: install upstream" rows.

## 8. Open questions for the user

1. **Meta membership.** Is the split right: `game-ai` and `game-genres` as direct installs, `game-audio` and `game-playtest` in `gamedev-core`? Moving `game-ai` in costs one description per Godot project.
2. **`godot-csharp` and `godot-multiplayer` as direct installs** rather than in `godot-meta`? A C#-first user may want a `godot-dotnet-meta` instead.
3. **`.mcp.json` writes.** `godot-mcp-setup` would write the project `.mcp.json` (after showing the diff), against the addon's own "setup never writes `.mcp.json`" rule. OK, or should it only print the entry? Should the addon gain a "write .mcp.json" option instead, so the logic lives in one place?
4. **Relative `headersHelper`.** `cat .godot/godot_mcp/headers.json` relies on Claude Code's cwd being the project dir. Is it acceptable for monorepos where the Godot project is a subfolder (then the absolute path, or `cat <subdir>/.godot/...`)?
5. **Port.** Let the addon pick from 6550 to 6649, or have setup pin 6550 so a future plugin-level MCP entry could work?
6. **Addon license.** The godot-mcp repo has no `LICENSE` file yet; add MIT before publishing so the setup skill can say what it installs.
7. **New content.** `game-design` and `game-playtest` have no upstream; they are written from scratch. Any house references or templates you want them built on?
8. **`game-assets`:** port it, or skip until there is a 2D art workflow to support?
9. **GodotPrompter.** It is MIT, active (845 stars) and has about 64 Godot skills. Only 2 were sampled here. Should a reviewer read the rest as merge sources (state machine, save-load, debugging, optimization) before batch 1, or should it ship later as direct installs for addon-specific skills (`beehave`, `limboai`, `phantom-camera`)?
