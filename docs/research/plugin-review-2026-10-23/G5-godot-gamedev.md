# G5 review: Godot and game dev (26 plugins + evals/godot-meta)

Scope: game-ai game-architecture game-assets game-audio game-design game-feel game-genres game-performance game-playtest game-prototype game-publish game-ui godot godot-addons godot-csharp godot-editor-tools godot-export godot-gdextension godot-mcp-setup godot-multiplayer godot-physics godot-shaders godot-testing godot-xr level-design, plus `evals/godot-meta/`.

Checks run: `validate_skill.py` passes on all 25 skills; `python3 scripts/plugins.py check` prints `ok`; `bash plugins/godot-mcp-setup/tests/install-addon-spec.sh` prints `all passed`. No `godot` binary on this host, so nothing was run in Godot. `claude plugin eval` was not run because it costs money. I checked API facts against the `godotengine/godot` class XML at the `4.5-stable`, `4.6-stable` and `4.7-stable` tags.

**A correction to the brief's premise:** Godot 4.5 is not current. Godot 4.7-stable shipped on 2026-06-18, and the latest release is 4.7.2 (2026-08-18). The group already targets 4.7 throughout ("checked against 4.7", with 4.4 to 4.7 notes in `godot/references/version-notes.md`), and the eval prompts say "Godot 4.7". The 4.4 facts are present and correct: typed dictionaries, `.uid` sidecars, Jolt built in from 4.4 and the default for new projects from 4.6. The 4.7 claims I spot-checked against the class XML hold: `DEVICE_ID_KEYBOARD`/`DEVICE_ID_MOUSE`, `area_mask` default 0, `user_presence_changed`, `EditorInterface.get_unsaved_scenes`, `OS.add_logger`, Dialogue Manager v4 cues and self-closing conditions. Do not "correct" these skills back to 4.5.

## Summary

- **[high] Every eval in the group is a routing case; none checks the result.** That is 69 cases across 25 plugins (godot-mcp-setup has none). No case pairs `fires-*` with a result grader, although several skills have rules a regex can check: version-gated APIs, `partial`/`EventHandler`, `shader_type`, no 3.x shader names, no credentials in files.
- **[high] Many `not-<sibling>` graders in per-plugin suites cannot fail, because the sibling is never loaded.** `claude plugin eval` loads only the plugin under test, so the grader passes every time. Examples: `game-ai/evals/trigger-game-ai-{1,2}/graders/not-game-genres.md`, `game-design/.../trigger-game-design-2/graders/not-game-playtest.md`, `game-ui/.../trigger-game-ui-2/graders/not-web-design.md`, `game-prototype/.../game-prototype-mechanic/graders/not-prototype.md`, `godot-physics/.../trigger-godot-physics-1/graders/not-godot-shaders.md`, and the `not-game-feel`/`not-game-performance`/`not-game-design` graders in game-audio, game-feel, game-architecture, game-ui and game-playtest. These sibling-boundary checks need a paired suite like `evals/godot-meta`. **11 of the 26 plugins are in no meta or bundle:** game-ai, game-assets, game-genres, game-prototype, game-publish, and godot-addons/csharp/editor-tools/gdextension/multiplayer/xr. So their real overlaps are never tested. The worst are game-genres vs game-design on economy, game-ai vs godot-addons on behaviour trees, game-prototype vs prototype, and godot-csharp vs csharp.
- **[med] No skill description names its near-misses, which `.claude/skills/skill-authoring/SKILL.md:48,107` requires.** Every body has a good "Not for:" line, but the description is the only text Claude sees when routing. The overlapping trigger words are:
  - "jitters": game-feel and godot-physics.
  - "stutter": game-performance.
  - "state machine": game-architecture, while game-ai claims "FSM".
  - "economy" / "balance this": game-design, while game-genres claims "genre-specific tuning".
  - "pause menu": game-ui, while godot claims "Control-node UI layout".
  - "procedural dungeon": level-design, while game-genres claims "roguelike".
- **[med] Version contradiction between siblings on the editor dock API.** `godot/references/version-notes.md:94` lists the `add_control_to_dock()` deprecation and `add_dock(EditorDock)` under **4.7**, and `godot/references/tool-scripts.md:110` says "the 4.7 docs mark…". The 4.6-stable `EditorPlugin.xml` already has `add_dock`, with `add_control_to_dock` marked `deprecated="Use [method add_dock] instead."`, and 4.5 has neither. `godot-editor-tools/SKILL.md:50` and its `docks-and-ui.md` correctly say 4.6+. Move the row to 4.6. Also, `tool-scripts.md:87-97` uses `EditorDock` with no version gate, so it fails to parse on 4.5 and earlier.
- **[med] The `godot` entry skill's route table (`godot/SKILL.md:21-30`) omits half of its siblings.** Missing: godot-addons, godot-xr, godot-gdextension, godot-editor-tools, game-architecture, game-performance, game-playtest, game-assets, game-genres, game-prototype, game-publish. Its description routes only to "physics, shader, export, test, C# or networking". `tool-scripts.md` covers EditorPlugin basics without pointing to `godot-editor-tools`.
- **[med] godot-mcp-setup installs unpinned code.** `install-addon.sh:20` fetches `archive/HEAD.tar.gz`. The dry run (pre-approved in `allowed-tools`) and the real install download separately, so the user approves one commit and may get another. The addon then runs inside the editor with the user's privileges. Pin it: have the dry run print `commit`, and install `archive/<commit>.tar.gz`.
- **[med] The root `evals/godot-meta` suite avoids the boundaries it exists to test.** The performance, UI and design prompts have no Godot context (`perf-frame-spikes`, `ui-hud-readability`, `design-economy`), so they never weigh game-performance against `godot/references/performance.md` or game-ui against godot Control. game-architecture has no case at all. Every case's `plugins:` list has also drifted from `programming-core`: it omits `grep-app`, `feature-flags` and `leakage-audit`. Its own README (`evals/godot-meta/README.md`) says to keep them in step.
- **[med] Every committed case in the group has `runs: 1`**, which the skill-evals checklist says not to commit. Six hard negatives are named `trigger-*-3`: in godot-addons, godot-csharp, godot-editor-tools, godot-gdextension, godot-multiplayer and godot-xr. Two more negatives carry `tags: [trigger]`: `negative-game-ai-jump` and `negative-game-genres-bt`. So `--tag routing` and name globs miss them.
- **[med] game-architecture and level-design have no hard negative. game-feel and game-performance have one positive each.**

## Per-plugin findings

### godot
- [med] `references/version-notes.md:94` and `references/tool-scripts.md:110`: the dock deprecation is listed under 4.7 but happened in 4.6 (see Summary). `tool-scripts.md:87` needs a "4.6+:" tag or the `ClassDB` fallback from `godot-editor-tools/references/docks-and-ui.md:58-82`.
- [med] `SKILL.md:21-30`: add route rows for godot-addons, godot-xr, godot-gdextension, godot-editor-tools and the remaining game-* skills (see Summary). Phrase them as "if installed", because most are opt-in.
- [med] `SKILL.md:3`: the description claims "any work in .gd, .tscn, .tres…". That is right for the entry point, but it gives the specialists no defence. Name them in it: "…hands off to godot-physics, godot-shaders, … when installed".
- [low] `SKILL.md:12`: the example says `"4.6"`, while every other file uses `"4.7"`. Cosmetic.

Evals now: 2 positives, 2 hard negatives (`godot-vs-unity`, and `godot-vs-shaders`, which uses three.js); no outcome case.

Suggested evals:
- `godot-version-gate-typed-dict` (outcome; scaffold `project.godot` with `config/features=PackedStringArray("4.3", …)`). Prompt: "Add an inventory script that maps item ids to counts." Graders: `regex` `not_contains` `Dictionary\[` on the file, plus `tool_used: Skill`. This tests "write for that version, never the newest" (`SKILL.md:12`).
- `godot-tscn-rename-outcome` (outcome; scaffold a player.tscn with a `[connection]` and a NodePath). Prompt: "rename Hurtbox to HitReceiver". Graders: a `regex` that the `[connection]` and `parent=` lines were updated, and a `regex` `not_contains` for a newly invented `uid://`.
- `godot-vs-godot3` (hard negative / clarifying). A `format=2` `.tscn` with `yield` code. Rubric: PASS if the answer flags Godot 3 and asks before porting.

### godot-physics
- [med] `SKILL.md:89`: the advice to "follow `target.get_global_transform_interpolated()`" sits under "Physics interpolation (2D 4.3+, 3D 4.4+)", but the method exists only on Node3D. The 4.7 `Node2D.xml`/`CanvasItem.xml` have no such method. Mark the step 3D-only and give the 2D path. `godot/references/camera.md:102` already says "is a Node3D method".
- [low] `SKILL.md:114`: "raise `floor_snap_length` (default 1.0)". That is the 2D default in pixels; `CharacterBody3D` defaults to 0.1 m.
- [low] `SKILL.md:104`: "SoftBody3D mass defaults to 1 kg for the whole body (was per point)". `SoftBody3D.total_mass` is already `default="1.0"` in 4.6 and 4.7, so the change must be in how Jolt interprets it. Reword, or mark "(unverified)" as version-notes does with "stiffness reworked".
- [low] The description and game-feel's both include "jitters" (see Summary). Add "not jump feel or camera feel (game-feel)".

Evals now: 2 positives, 1 hard negative (Unity CCD); `not-godot-shaders` in trigger-1 cannot fail.

Suggested evals:
- `godot-physics-2d-camera-jitter` (positive): "Godot 4.7 2D, Camera2D following CharacterBody2D jitters at 144 Hz after turning on physics interpolation." Pair it with an outcome rubric: FAIL if the answer calls `get_global_transform_interpolated()` on a 2D node. This would catch the bug above.
- `godot-physics-vs-feel-coyote` (hard negative): "what coyote time and jump buffer values feel good for a precision platformer?" The answer is design values, with no engine API.

### godot-shaders
- No correctness issues found. The 3.x rename list, `hint_screen_texture`, `TIME` rollover of 3600 s, and the Compatibility-renderer limits are all right.

Evals now: 2 positives, 1 hard negative.

Suggested evals:
- `godot-shaders-dissolve-outcome` (outcome). Graders: a `regex` for `shader_type canvas_item`, a `regex` `not_contains` `SCREEN_TEXTURE|hint_color|hint_albedo`, and `tool_used`.
- `godot-shaders-vs-godot-anim` (hard negative): "Tween a Sprite2D's modulate to flash white on hit". Plain GDScript is enough; no shader needed.

### godot-export
- No correctness issues found. The C#-to-Web limitation is confirmed for 4.7, and the 4.7 `[runnable_presets]` and Shader Baker notes are consistent.

Evals now: 2 positives, 1 hard negative (itch butler).

Suggested evals:
- `godot-export-web-headers-outcome` (outcome). Prompt: the SharedArrayBuffer case. Rubric PASS: names COOP `same-origin` and COEP `require-corp`, or turning off Thread Support; says not to use `file://`.
- `godot-export-missing-json` (positive): "my exported build can't find res://data/items.json".

### godot-testing
- [low] `references/gdunit4.md:135` and `references/gut.md:116-117` use tag-pinned actions (`actions/checkout@v4`, `setup-godot@v2`). `godot-export/references/ci.md:44` insists on SHA pins. Pick one policy.

Evals now: 2 positives, 1 hard negative (Jest/Phaser).

Suggested evals:
- `godot-testing-gut-outcome` (outcome; scaffold `addons/gut/` and `src/inventory.gd`). Graders: `file_exists` `test/unit/test_inventory.gd`, or a `regex` on any created `test_*.gd` for `extends GutTest`; and a `regex` `not_contains` `^\s*assert\(` in that file.
- `godot-testing-vs-playtest` (hard negative): "plan a playtest with 6 strangers". This mirrors game-playtest's own negative.

### godot-csharp
- [low] `SKILL.md:110-118` repeats the 4.7 C# break list from `godot/references/version-notes.md:98-108`. That is acceptable for an opt-in plugin, but the two copies already differ slightly (`OptimizedTranslation.Generate()` appears only here). Keep one as the source of truth.

Evals now: 2 positives, 1 hard negative (ASP.NET); the negative is misnamed `trigger-godot-csharp-3`.

Suggested evals:
- `godot-csharp-port-outcome` (outcome). Prompt: the existing port case. `regex` graders on `scripts/Enemy.cs`: `partial class Enemy`, `EventHandler`, `_PhysicsProcess\(double`.
- `godot-csharp-vs-csharp-unity` (hard negative): a Unity MonoBehaviour C# question. It should stay out.

### godot-gdextension
- No correctness issues found. `compatibility_minimum` ≥ 4.1, `GDREGISTER_RUNTIME_CLASS` and the gdext `api-4-x` feature are all right.

Evals now: 2 positives, 1 hard negative (`trigger-godot-gdextension-3`, misnamed).

Suggested evals:
- `gdextension-compat-outcome` (outcome; scaffold a `.gdextension` with `compatibility_minimum = "4.7"` and a project on 4.5). Rubric PASS: names the mismatch and the fix of building against the oldest API.
- `gdextension-vs-engine-module` (positive): "I need to patch a Godot built-in node's behaviour; extension or module?"

### godot-multiplayer
- No correctness issues found. The security checklist on lines 15-23 is strong.

Evals now: 2 positives, 1 hard negative (split-screen, misnamed `trigger-*-3`).

Suggested evals:
- `godot-mp-rpc-validation-outcome` (outcome). Prompt: "add a buy_item RPC". Rubric PASS: `any_peer` used with `get_remote_sender_id()`, an index-range check and a server-only guard.
- `godot-mp-vs-http-leaderboard` (hard negative): "post scores to my REST leaderboard with HTTPRequest".

### godot-addons
- No correctness issues found. The Dialogue Manager v4 claims check out against the v4.0 changelog (cues, self-closing conditions).

Evals now: 2 positives, 1 hard negative (camera shake with no addon).

Suggested evals:
- `godot-addons-vs-game-ai-bt-theory` (hard negative; it only means something in a paired suite with game-ai): "what's the difference between memory and reactive selectors in behaviour trees?" with no addons present.
- `godot-addons-limbo-csharp` (positive): "LimboAI GDExtension from C# can't find BTPlayer".

### godot-editor-tools
- No correctness issues found. The 4.6 dock version and the `@tool`/`#if TOOLS` rules are right.

Evals now: 2 positives, 1 hard negative (pause menu, misnamed).

Suggested evals:
- `editor-tools-dock-4-5-outcome` (outcome; scaffold `config/features` "4.5"). Prompt: "add a dock". `regex` `not_contains` `EditorDock\.new\(\)|add_dock\(` without a `ClassDB` guard. This tests version gating.
- `editor-tools-vs-godot-tool-script` (boundary): a one-line `@tool` script that draws a gizmo circle in `_draw`. Decide whether godot or godot-editor-tools should own this, and test it in a paired suite.

### godot-xr
- No correctness issues found. All signal names were verified against the 4.7 `OpenXRInterface.xml`.

Evals now: 2 positives, 1 hard negative (desktop FPS controller, misnamed).

Suggested evals:
- `godot-xr-judder-outcome` (outcome). Prompt: "hands lag on Quest 3 at 90 Hz". Rubric PASS: sets `physics_ticks_per_second` from `display_refresh_rate`, and does not advise changing V-Sync.
- `godot-xr-vs-mobile-export` (hard negative): an Android phone export keystore error with no XR.

### godot-mcp-setup
- [med] `scripts/install-addon.sh:20,58-66`: downloads `HEAD.tar.gz` unpinned, and the dry run and install fetch separately. Install the commit the dry run printed (`archive/<sha>.tar.gz`), and fail if `commit=unknown`.
- [low] `install-addon.sh:69-75`: the member list is checked for `..` and absolute paths but not for symlink members elsewhere in the archive. GNU tar and bsdtar both defend against symlink traversal by default, and the addon dir is re-checked at line 84, so the risk is low. Adding `--no-same-permissions` and a symlink scan of `$tmp/list` (via `tar -tvzf`) would close it.
- [low] `tests/install-addon-spec.sh` passes but nothing runs it: it isn't wired into `scripts/plugins.py check` and isn't a `*.spec.ts` for `bun test`. Note it in the plugin README, or add it to `check`.
- [low] `SKILL.md:52-55`: the headless `--editor` load runs project `@tool` code and the freshly downloaded addon. The gotcha on line 99 covers project trust but not the trust in unpinned addon code.

Evals now: none. Routing evals don't apply because of `disable-model-invocation: true`.

Suggested evals:
- `mcp-setup-no-write-before-approval` (outcome; scaffold a Godot dir and set `GODOT_MCP_TARBALL` through `case.yaml` `execution.env`). Prompt: `/godot-mcp-setup .` in `-p` mode. Graders: `file_exists` `.mcp.json` `exists: false` (there is no approval in headless mode), and a `regex` on the last message for `new_version=`.
- `mcp-setup-windows-refusal` (outcome rubric, simulated in the prompt).

### game-feel
- No correctness issues found.
- [low] The description shares "the camera jitters" with godot-physics "jitters" and game-performance "stutter". Add "not frame-rate drops (game-performance) or Godot body/collision API (godot-physics)".

Evals now: 1 positive, 1 hard negative. This is the thinnest suite in the group.

Suggested evals:
- `game-feel-shake-random` (positive): "my screen shake looks jerky and makes testers sick; I set a random offset each frame".
- `game-feel-stick-diagonals` (positive): "diagonals on the gamepad snap to the axes".
- `game-feel-floaty-outcome` (outcome). Rubric PASS: asymmetric gravity (1.5 to 3x), coyote 80-120 ms, buffer 100-150 ms, values in seconds.
- `game-feel-vs-godot-physics-floor` (hard negative): "CharacterBody2D `is_on_floor()` always false".

### game-performance
- [med] It overlaps with `godot/references/performance.md`, which correctly defers the method to game-performance. But the godot skill body never routes to game-performance, so in a Godot project godot wins and the measure-first workflow may never load (see the root-suite gap).

Evals now: 1 positive, 1 hard negative.

Suggested evals:
- `game-performance-thermal` (positive): "phone build holds 60 then drops to 40 after 5 minutes".
- `game-performance-gc-csharp` (positive): "Unity C# game spikes every few seconds; profiler shows GC.Alloc".
- `game-performance-measure-first-outcome` (outcome). Prompt: "make my game faster, here's my enemy update loop". Rubric PASS: asks for a profile and a ms target, or classifies CPU vs GPU, before rewriting. FAIL if it only micro-optimizes.

### game-architecture
- [low] "state machine" in the description is shared with game-ai's "FSM". The body (`SKILL.md:10`) separates them, but the description doesn't.

Evals now: 2 positives, **0 hard negatives**.

Suggested evals:
- `game-architecture-vs-ai-enemy` (hard negative): "guards should patrol, chase, search last-known position". The answer is game-ai.
- `game-architecture-vs-coding-webapp` (hard negative): "how should I structure Redux slices for my React dashboard?"
- `game-architecture-save-outcome` (outcome). Rubric PASS: a version field with migrations, a temp-then-rename atomic write, and no engine-native resource loading of saves.

### game-ai
- No correctness issues found.

Evals now: 2 positives, 1 hard negative (tagged `[trigger]`, not `routing`); `not-game-genres` cannot fail.

Suggested evals:
- `game-ai-bt-running` (positive): reuse the prompt from `game-genres/evals/negative-game-genres-bt`, which is a textbook game-ai positive that game-ai's own suite lacks.
- `game-ai-vs-menu-fsm` (hard negative): "title/pause/game-over screen flow is a mess of booleans". The answer is game-ui or game-architecture.

### game-genres
- [med] Its `trigger-game-genres-2` (a tower-defense gold glut) is just as much a game-design "economy / faucets and sinks" prompt. Only one plugin is loaded, so the case cannot show which should win. Define the boundary in both descriptions: genre norms vs a generic economy model.

Evals now: 2 positives, 1 hard negative (BT, tagged `[trigger]`).

Suggested evals:
- `game-genres-vn-branching` (positive): "my visual novel's flags explode combinatorially across 3 routes".
- `game-genres-vs-design-farming-economy` (hard negative, paired suite): reuse the game-design-2 prompt.

### game-design
- No correctness issues found.

Evals now: 2 positives, 1 hard negative (playtest).

Suggested evals:
- `game-design-vs-level-pacing` (hard negative): "six combat rooms back to back then the boss".
- `game-design-economy-outcome` (outcome). Rubric PASS: a sources/sinks map, a proposed sink with a number, and simulation over a play-through rather than averages.

### level-design
- No correctness issues found. The procgen cross-link from `game-genres/references/roguelike.md:41` is good.

Evals now: 2 positives, **0 hard negatives**.

Suggested evals:
- `level-design-vs-godot-tilemap-api` (hard negative): "TileMapLayer terrain set won't autotile corners in Godot 4.7".
- `level-design-vs-design-loot` (hard negative): "what drop rate for legendaries so players aren't starved?"
- `level-design-softlock-outcome` (outcome; give a room/gate graph in the prompt). Rubric PASS: finds the key-behind-its-own-lock soft-lock.

### game-ui
- No correctness issues found.

Evals now: 2 positives, 1 hard negative (WCAG SaaS); `not-game-feel` and `not-web-design` cannot fail.

Suggested evals:
- `game-ui-ultrawide-hud` (positive): "HUD stretches on 21:9 and the minimap goes off screen on Steam Deck".
- `game-ui-vs-godot-anchors` (self-negative): "Godot Control stuck in the top-left on resize". The root suite already wants godot here; mirror it per plugin.

### game-audio
- No correctness issues found. The loudness targets match ASWG-R001.

Evals now: 2 positives, 1 hard negative.

Suggested evals:
- `game-audio-slider-outcome` (outcome). Prompt: "volume slider barely changes anything until the bottom". Rubric PASS: `linear_to_db` conversion and mute at 0.
- `game-audio-vs-godot-area-mask` (hard negative): "4.7 upgrade: Area audio_bus_override stopped working". This is engine API, owned by godot.

### game-playtest
- No correctness issues found.

Evals now: 2 positives, 1 hard negative (GUT).

Suggested evals:
- `game-playtest-script-outcome` (outcome). Prompt: "write the facilitator script". Graders: `regex` `not_contains` leading questions such as `too (floaty|hard|easy)\?`, plus an `llm` rubric for goal-phrased tasks and no helping.

### game-prototype
- No correctness issues found.

Evals now: 2 positives, 1 hard negative; `not-prototype` cannot fail. `plugins/prototype/evals/` has only `prototype-vs-planning`, so the reverse boundary is untested too.

Suggested evals:
- `game-prototype-vs-publish-jam-upload` (hard negative): "how do I attach my build to the itch jam submission with butler?"
- `game-prototype-brief-outcome` (outcome). `regex` for `KILL IF:` and `TIMEBOX:` in the created prototype file.

### game-publish
- [low] `SKILL.md:46` and `references/steam-release-planning.md:10`: the 21-day app-fee wait matches the current Steamworks onboarding page, but `partner.steamgames.com/steamdirect` still says 30 days. Name both pages and say they disagree, rather than giving one number.

Evals now: 2 positives, 1 hard negative.

Suggested evals:
- `game-publish-credential-refusal` (outcome). Prompt: "just put my steam password in app_build.vdf so CI works". Rubric PASS: refuses that part and proposes the secret store or a cached `config.vdf`; FAIL if any file contains a password.
- `game-publish-vs-godot-export` already exists. Add `game-publish-capsule-sizes` (positive).

### game-assets
- No correctness issues found.

Evals now: 2 positives, 1 hard negative (SaaS visual direction).

Suggested evals:
- `game-assets-manifest-outcome` (outcome; `file_exists` + `regex`). "Make the asset manifest for my roguelike". The file must list `license` and `source` per entry.
- `game-assets-vs-shaders-outline` (hard negative): "add a white outline shader to my sprites in Godot".

## Root suite `evals/godot-meta`

Now: 12 positives, all `runs: 3`, 4 boundary graders: game-feel/godot-physics, godot/game-ui, godot-physics/game-feel and godot-testing/unit-testing. They passed 3/3 in `docs/research/evals-2026-10-17.md:36-42`.

Issues:
- [med] The `plugins:` lists in all 12 `prompt.md` files omit `grep-app`, `feature-flags` and `leakage-audit` from `programming-core`.
- [med] There is no game-architecture case.
- [med] The perf, UI and economy cases are engine-agnostic, so the Godot-vs-gamedev-core overlap the suite exists for is not tested there.

Suggested cases:
1. `godot-camera-jitter`: "Godot 4.7 Camera3D child of the player stutters on 144 Hz with interpolation on". Expect `fires-godot-physics` and `not-game-performance`.
2. `godot-perf-profiler`: "Godot profiler: _physics_process 9 ms with 400 Area2D bullets". Decide the owner (probably game-performance, with godot's performance reference as support) and grade it, with `not-game-feel`.
3. `godot-player-fsm`: "my Godot player script is a 400-line match over states; node-based states or enum?" Expect `fires-game-architecture` and `not-game-feel`.
4. `godot-pause-menu-focus`: "Godot pause menu: no button focused on gamepad, back unpauses". Pick godot or game-ui and grade the other as `not-`. This is the sharpest overlap left untested.
5. `level-vs-design-pacing`: "six combat rooms back to back" in a Godot project. Expect `fires-level-design` and `not-game-design`.
6. A second paired suite (`evals/godot-full/`) that also loads the 11 opt-in plugins: godot-addons vs game-ai (behaviour-tree theory), game-genres vs game-design (economy), game-prototype vs prototype, godot-csharp vs csharp, and godot-export vs game-publish together.

## Cross-group notes

- **prototype / web-design / design-core (outside this group):** game-prototype and game-ui name them correctly in their body "Not for" lines. But `plugins/prototype/evals` has one case and none guards against game-prototype. The `web-design` evals have nothing on game UI.
- **csharp / dotnet-testing / msbuild:** godot-csharp's `SKILL.md:11` points to them. Check whether `plugins/csharp`'s description claims "any .cs file"; if so it collides with godot-csharp in any session that has both, which the dotnet-meta + godot setup does.
- **unit-testing:** the root suite covers the godot-testing boundary. game-playtest's "Not for" line also points to `unit-testing`.
- **Systemic, likely repo-wide:**
  - Per-plugin `not-<other-plugin>` graders cannot fail when the other plugin isn't a dependency. Either delete them, or move them into paired suites and say so in the skill-evals reference.
  - `runs: 1` is committed everywhere in this group.
  - Negative cases are named `trigger-*`.
