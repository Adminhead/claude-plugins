# G5 Godot and game development, 2026-11-14

## Summary

- 25 plugins reviewed (the brief says 26; I count 12 godot-* and 13 game-*/level-design, plus the two metas); 18 read in full on the second pass, the other 7 (godot, godot-csharp, godot-shaders, godot-mcp-setup, game-design, game-feel, game-publish) on SKILL.md plus sampled references (see "Read depth" at the end). Verdicts: KEEP 10 (godot-shaders, godot-export, godot-testing, godot-csharp, godot-multiplayer, godot-gdextension, godot-xr, godot-addons, godot-editor-tools, game-publish), KEEP-FIX 3 (godot, godot-physics, godot-mcp-setup), SLIM-and-MERGE 11 into one `game-craft` (game-design, game-feel, game-ui, game-audio, game-playtest, game-ai, game-architecture, game-assets, game-prototype, level-design, game-performance), DEPRECATE 1 (game-genres, except `dialogue.md` and an 8-line checklist that move into `game-craft`). Two bundle metas (godot-meta, gamedev-core) stay as shells.
- Second pass changes: all eight godot-* plugins I had only skimmed (addons, editor-tools, export, gdextension, multiplayer, physics rest, testing, xr) are stronger than the first pass said, because their references hold post-cutoff, version-pinned facts (gut 9.7.1, gdUnit4 6.2.2 exit codes, godot-cpp 10.0.0, gdext 0.5.5, Beehave 2.9.3, LimboAI 1.8.1, Dialogue Manager 4.1.0). game-prototype does not duplicate the marketplace `prototype` plugin (the first pass said it did; that was wrong, `prototype` is web UI and state-model only, `prototype/skills/prototype/SKILL.md:3-9`).
- The godot-* skills earn their place on K-private: Godot 4.4 to 4.7 migration facts (`godot/skills/godot/references/version-notes.md`), Jolt differences, Godot 3 to 4 shader and API renames, C# source-generator rules. Godot 4.7 shipped 2026-06-18 (per the 10-23 report), after Sonnet 5.5's June 2026 cutoff, so the 4.7 rows cannot be model knowledge. The 3.x-to-4 renames and `partial`/`EventHandler` rules are mostly known to a current model, so they matter for Haiku, not Sonnet or Opus.
- The game-* craft skills (design, feel, genres, level-design, ui, audio, playtest, ai, architecture, performance, assets, prototype) fail the Generic test. Examples: coyote time 80 to 120 ms, trauma-squared shake, faucets and sinks, shuffle bags, Sid Meier's interesting decisions. Sonnet 5.5 produces the same advice unprompted. No outcome eval measures lift, and the family has 0 calls in 7 to 9 listed sessions. 13 separate game-* plugins should be one or two: one `game-craft` skill with trimmed references, plus game-publish separate.
- [high] Prior open bug STILL OPEN and now source-confirmed: `godot-physics/SKILL.md:89` tells the model to call `get_global_transform_interpolated()` for cameras under "2D 4.3+, 3D 4.4+" interpolation. Node2D has no such method in 4.7 (checked `4.7-stable/doc/classes/Node2D.xml`).
- [high] Prior open bug STILL OPEN and source-confirmed: `version-notes.md:94` and `tool-scripts.md:110` date the `add_dock` deprecation to 4.7. `EditorPlugin.xml` at 4.5-stable has no `add_dock`; at 4.6-stable it has `add_dock` and marks `add_control_to_dock` deprecated. Both should say 4.6. `tool-scripts.md:87-97` also uses `EditorDock` with no version gate.
- V15 (godot-mcp-setup unpinned download) is FIXED. The spec passes ("all passed").
- Evals are still all routing: 69 per-plugin cases plus 13 in `evals/godot-meta`. `outcome_evals` is empty for the whole family in plugin-data.tsv. The K-private claim for godot-* has never been measured.
- Meta membership: six godot plugins (addons, csharp, editor-tools, gdextension, multiplayer, xr) and five game plugins (ai, assets, genres, prototype, publish) are in no meta. The brief says seven godot plugins; plugin-data.tsv and `godot-meta/.claude-plugin/plugin.json` give six, since godot-mcp-setup is in godot-meta.

## Prior findings re-checked

| Prior finding (source) | Status | Evidence |
| --- | --- | --- |
| V15 godot-mcp-setup downloads unpinned and twice (plan V15, A8) | FIXED | `install-addon.sh:5-15,49-51,96-97`: real install requires `--commit <40-hex>`, fetches `archive/<sha>.tar.gz`, refuses if `git get-tar-commit-id` differs. `plugin.json` is 0.2.0. Spec run: "all passed". Commit 9939715a. |
| godot-mcp-setup symlink-member scan, spec not wired into check (G5 10-23, low) | STILL OPEN (low) | `install-addon.sh:86-88` still checks only absolute and `..` paths. Spec still not in `scripts/plugins.py check`. UNVERIFIED for check wiring beyond the 10-23 note. |
| Every eval is routing-only, no outcome cases (G5 high) | STILL OPEN | 69 trigger/negative dirs under `plugins/godot*|game-*|level-design/evals`. `outcome_evals` column is empty for all 26 rows. |
| `not-<sibling>` graders that cannot fail (G5 high) | FIXED | Commit 7d02eaad "drop sibling graders whose target plugin is never loaded". |
| Dock deprecation under 4.7 instead of 4.6 (G5 med; F8) | STILL OPEN, source-confirmed | `version-notes.md:94`, `tool-scripts.md:110`; `godot-editor-tools/SKILL.md:50` correctly says 4.6+. 4.5 vs 4.6 `EditorPlugin.xml` fetched. |
| `tool-scripts.md:87` EditorDock sample has no version gate (G5 med) | STILL OPEN | `tool-scripts.md:85-100` unchanged. |
| godot route table omits half the siblings (G5 med) | STILL OPEN | `godot/SKILL.md:21-30` lists physics, shaders, export, testing, csharp, multiplayer, mcp-setup and a one-row game-* line naming only six game skills. Missing: godot-addons, godot-xr, godot-gdextension, godot-editor-tools, game-architecture, game-performance, game-playtest, game-assets, game-genres, game-prototype, game-publish. |
| `get_global_transform_interpolated()` 3D-only but given for 2D (G5 med; F8) | STILL OPEN, source-confirmed | `godot-physics/SKILL.md:82,89`; `Node2D.xml` 4.7 lacks it; `godot/references/camera.md:102` already says Node3D only. |
| `floor_snap_length` default 1.0 is 2D only (G5 low) | STILL OPEN, second copy found | `godot-physics/SKILL.md:114` and `references/controllers.md:204`. |
| SoftBody3D "mass defaults to 1 kg whole body" (G5 low) | STILL OPEN (UNVERIFIED claim) | `godot-physics/SKILL.md:104`; version-notes.md:91 marks "stiffness reworked" only. |
| godot-testing tag-pinned actions vs godot-export SHA pins (G5 low) | STILL OPEN | `godot-testing/references/gdunit4.md:135`, `gut.md:116-117` use `@v4`/`@v2`; `godot-export/references/ci.md:44` requires SHAs. |
| godot-csharp duplicates 4.7 C# break list (G5 low) | STILL OPEN | `godot-csharp/SKILL.md:112-118` and `version-notes.md:97-105`. |
| 11 plugins in no meta (G5 high) | STILL OPEN, now 11 | godot-meta lists programming-core, gamedev-core, godot, physics, shaders, export, testing, mcp-setup only. |
| Root suite engine-agnostic perf/UI/economy prompts, no game-architecture case (G5 med) | PARTLY | Suite now has 13 cases (`ls evals/godot-meta/evals`). No `architecture-*` case. `perf-frame-spikes` and `design-economy` were not re-read in full. |
| game-publish 21 vs 30 day Steam wait (G5 low) | UNVERIFIED | Not re-checked (needs source check). |

## Per-plugin

### godot (entry skill, 21 references) — KEEP-FIX (medium-high)
- Value: K-private plus K-decision. `references/version-notes.md` holds 4.3 to 4.7 rows. The 4.7 rows (`:74-95`, `DEVICE_ID_KEYBOARD`, `area_mask` default 0, stretch default `canvas_items`+`expand`, typed-return inheritance) are post-cutoff. 4.5 to 4.6 rows (`duplicate(true)` no longer copies external sub-resources `:52`; `.tscn` stops writing `load_steps` `:65`) are things a model trained on 4.3 code gets wrong. `SKILL.md:12` "write for the project's version, never the newest" and `:87-93` (never invent a `uid://`, `.uid` sidecars, never hand-merge `.tscn`) change what the model does. Verification commands `:99-103` are a decision procedure (exit 0 after script error).
- Evidence: 9 sessions listed, 0 calls, 0 loads, listing 136 tokens, 4 eval cases (routing). No outcome eval.
- What Sonnet 5.5 does without it: writes typed GDScript 4.x correctly, uses `move_and_slide()` with no args, and knows `@onready`. It would not know 4.6/4.7 changes and would likely write `Dictionary[...]` into a 4.3 project. The Godot 3 tell list `:107` is generic for Sonnet and Opus, useful for Haiku.
- Fixes:
  - [high] `version-notes.md:94`, `tool-scripts.md:110`: move the dock deprecation row to 4.6; gate `tool-scripts.md:85-100` with "4.6+" and give the `add_control_to_dock` fallback (or point at `godot-editor-tools/references/docks-and-ui.md`).
  - [med] `SKILL.md:21-30`: add "if installed" route rows for the omitted siblings. Since game-* collapses to `game-craft` (see below), this is one row, not eleven.
  - [med] The description at `SKILL.md:3` is about 440 characters; fine, but it claims "any work in .gd, .tscn" and gives no defence to specialists. Name `godot-physics`, `godot-shaders` in it.
  - [low] `SKILL.md:12` example `"4.6"` vs `"4.7"` elsewhere.
  - [med] Add one outcome eval for the version gate (`config/features` "4.3", ask for an inventory map; regex `not_contains Dictionary\[`). This is the single measurement that would justify the whole family.
  - [low] About 2,400 lines of references; several (`signals-groups.md`, `patterns.md`, `audio.md`, `camera.md`) restate mainstream Godot practice. Candidate SLIM later, after the outcome eval; no deletion now.

### godot-physics — KEEP-FIX (medium)
- Value: K-private (Jolt joint inversion `:100`, `face_index` -1 `:99`, 4.7 `WorldBoundaryShape3D.plane.d` flip `:104`) plus K-decision (jitter and is_on_floor checklists `:111-118`).
- Evidence: 7 listed, 0 calls, 124 tokens; 3 routing cases.
- Fixes:
  - [high] `SKILL.md:89`: step 4 is 3D-only. Say "3D: follow `target.get_global_transform_interpolated()`; 2D: keep the camera in `_process` on a non-interpolated branch and read the target's `global_position` after interpolation (verify)". Confirmed absent from Node2D 4.7.
  - [low] `:114` and `references/controllers.md:204`: `floor_snap_length` default 1.0 is the 2D value (pixels); CharacterBody3D default is 0.1 m. Same wrong default in two places.
  - [low] `references/bodies-advanced.md:74`: "`AudioStreamPlayer.area_mask` defaults to 0"; the property is on `AudioStreamPlayer2D/3D` only (as `version-notes.md:87` says).
  - Read in full on the second pass: `references/controllers.md` (coyote/buffer/dash/wall-jump/FPS recipes), `queries.md`, `bodies-advanced.md`. Specific non-obvious lines: `CylinderShape3D` unreliable under Godot Physics (`bodies-advanced.md:86`); spiral-of-death cap `max_physics_steps_per_frame` default 8 (`:144`); Jolt unsupported joint properties (`:133` area); mouse look in `_unhandled_input` is fine under interpolation (`controllers.md:195`). The coyote/buffer recipe at `controllers.md:25-47` triplicates `game-feel/SKILL.md:26-27` and `game-genres/references/platformer.md:36-37`; keep the engine code here, drop the other two.
  - [low] `:104`: SoftBody3D mass sentence is unverified; mark it.
  - [low] Description: add "not jump feel (game-craft)" for the "jitters" collision.

### godot-shaders — KEEP (medium-high)
- Value: K-private plus Haiku-level K-decision. `SKILL.md:110` rename table (`SCREEN_TEXTURE`, `hint_color`, `WORLD_MATRIX`→`MODEL_MATRIX`, `CAMERA_MATRIX`→`INV_VIEW_MATRIX`), `:119` 4.7 `textureQueryLod` in `vertex()` compile error, `:120` `LinearToSRGB` clamp, `:111` `COLOR` vs `ALBEDO`. Sonnet 5.5 knows the 3.x renames; the 4.5 to 4.7 items it does not.
- Evidence: 7 listed, 0 calls, 125 tokens; 3 routing cases; root suite has `shader-gdshader`.
- Fixes: [med] add outcome case (dissolve shader; regex `not_contains SCREEN_TEXTURE|hint_color`). No factual issues found.

### godot-export — KEEP (medium-high), read in full
- Value: K-private. Quotable lines: 4.7 `[runnable_presets]` replaces per-preset `runnable=` (`SKILL.md:62`); 4.7 drops built-in OBB (`references/mobile.md:40`); Shader Baker does not run with `--headless` and bakes only drivers the exporting OS supports (`SKILL.md:70-71`, `references/ci.md:112`); `setup-godot` v2 `use-dotnet` defaults to true and `version` needs the patch (`references/ci.md:84`); `--check-only` does nothing without `--script` (`references/presets-and-cli.md:37`); `EditorScript` cannot run via `--script` (`ci.md:103`). A model without this writes Godot 3 export advice (`Linux/X11`) and `rcedit` steps.
- Evidence: 7 listed, 0 calls, 114 tokens; 3 routing cases.
- Fixes: [low] `references/ci.md:44,47` use `<full-sha>` placeholders; fine as teaching text, but add one real example SHA or a `gh api` line to resolve it. [low] pin policy still differs from godot-testing (see below).

### godot-testing — KEEP (high), read in full
- Value: K-private plus K-decision. Version tables: GUT 9.7.x for 4.7, doubles return typed defaults not `null` (`references/gut.md:11`, `SKILL.md:125`); gdUnit4 v6.2.x supports 4.5 to 4.7.1 with exit codes 100/101/103/104/105 (`references/gdunit4.md:11-15,100`); the CLI stops at the first failure without `-c` (`gdunit4.md:99`); `-d` in CI can hang at a `debug>` prompt (`gut.md:30`, `SKILL.md:122`); bare `assert()` inside `_initialize()` hangs a runner (`SKILL.md:120`). These are things Sonnet 5.5 gets wrong because GUT 9.5+ and gdUnit4 6.x are newer than most training data.
- Evidence: 9 listed, 0 calls, 116 tokens; 3 routing cases plus `testing-gut` in the root suite.
- Fixes: [med] add an outcome case (`extends GutTest`, no bare `assert(`). [low] STILL OPEN: tag-pinned actions at `references/gdunit4.md:135` (`actions/checkout@v4`), `references/gut.md:116-117` (`@v4`, `setup-godot@v2`), against SHA pins at `godot-export/references/ci.md:44`. Pick SHA pins in both.

### godot-csharp — KEEP (medium-high)
- Value: K-private plus K-decision, the strongest Haiku value in the family. Specific corrections: `partial` on every derived class including intermediates (`SKILL.md:29`); `[Signal]` delegates must end `EventHandler` or GD0201 (`:34`); `+=` on custom signal not auto-disconnected, next emit throws `ObjectDisposedException` (`:35`); name spellings `GodotObject`, `GpuParticles2D`, `HttpRequest`, `Json` (`:32`); `double delta` (`:31`); `#if TOOLS` around a runtime `[Tool]` node removes it from exports (`:38`); no web export (`:110`); `ConfigureAwait(false)` warning (`:36`). The 4.7 C# break list `:112-118` is post-cutoff.
- Evidence: 9 listed, 0 calls, 110 tokens; in no meta; 3 routing cases (third is misnamed `trigger-godot-csharp-3`, a hard negative).
- What Sonnet 5.5 does without it: gets `partial`, PascalCase and `EventHandler` right most of the time; likely misses the signal-disconnect and `GodotObject` renames. Haiku misses more.
- Fixes:
  - [med] Add to `godot-meta` as optional, or a `godot-csharp-meta`; currently a C# Godot project does not get it.
  - [low] Single-source the 4.7 C# list (`SKILL.md:112-118` vs `version-notes.md:97-105`).
  - [med] Outcome eval: port an `Enemy.gd`, regex for `partial class`, `EventHandler`, `_PhysicsProcess\(double`.

### godot-multiplayer — KEEP (medium-high), read in full
- Value: K-decision plus security. The seven `any_peer` checks at `SKILL.md:15-23` (sender id from `get_remote_sender_id()`, never `load(client_string)`, `allow_object_decoding` off) change generated code. Non-obvious lines: `SceneMultiplayer` runs an auth handshake before `peer_connected` fires, and both sides must call `complete_auth()` (`references/join-and-disconnect.md:37,77`); `set_multiplayer_authority()` is local-only and must be set on every peer (`SKILL.md:31`); `spawn_function` must be set on every peer (`references/replication-and-rpc.md:72`); `replication_interval` 0.0 means every frame, not off (`replication-and-rpc.md:113`); `server_relay` (`:135`); `Engine.get_physics_interpolation_fraction()` is the wrong clock for network interpolation (`references/sync-prediction.md:26`); reconnects get a new peer id, so key on a token (`join-and-disconnect.md:101`); "no `headless` feature tag" (`references/dedicated-server.md:8`).
- Evidence: 0 listed (not installed anywhere visible); 3 routing cases.
- Fixes: [med] outcome eval (`buy_item` RPC: sender id, range check, server guard). [low] `join-and-disconnect.md` uses `multiplayer.auth_callback = ...` on the `MultiplayerAPI` property; it only works untyped (it is a `SceneMultiplayer` member), so add `var sm := multiplayer as SceneMultiplayer` to survive strict typing (UNVERIFIED by running Godot).

### godot-gdextension — KEEP (medium-high), read in full
- Value: K-private. godot-cpp 10.x is versioned independently with an `api_version` option, no `4.6`/`4.7` branches (`references/cpp-binding.md:17`); `use_hot_reload=yes` is off by default in 10 (`cpp-binding.md:179`); a 4.4-built gdext extension does not load in 4.3 (`references/rust-gdext.md:116`); do not hold a `base_mut()` guard across re-entrant calls (`rust-gdext.md:110`); 4.7 engine no longer builds `text_server_adv`/`fb` as GDExtensions (`SKILL.md:51`); GDExtension classes get no generated C# wrappers (`SKILL.md:38`). A model trained before godot-cpp 10 gives the branch-per-version advice.
- Evidence: 0 listed. Fixes: none required. Needs source check: "godot-cpp 10.0.0-stable released 2026-09-15" and "gdext v0.5.5 2026-08-09" (`cpp-binding.md:4`, `rust-gdext.md:3`).

### godot-xr — KEEP (medium-high), read in full
- Value: K-private. Default action map has no `primary_x`/`primary_y`, read the stick with `get_vector2("primary")` (`references/input-and-interaction.md:28`); `XRController3D` is not a physics body, so a `Joint3D` to it does nothing (`input-and-interaction.md:102`); V-Sync is ignored under OpenXR, raise `physics_ticks_per_second` instead (`SKILL.md:39`); never enable frame synthesis with ASW (`references/platform-features.md:45`); there is no `XRSpatialAnchor`, the node is `XRAnchor3D` (`platform-features.md:73`); 4.7 foveation defaults flipped (`platform-features.md:40`). All of this is 4.5 to 4.7 content.
- Evidence: 0 listed. Fixes: none required.

### godot-addons — KEEP (high), read in full
- Value: K-private, the strongest of the niche set. Version-pinned API facts for four addons the model cannot know at these versions: Dialogue Manager 4 renamed titles to cues, response conditions are self-closing `[if cond /]`, `set`/`do` became `$>` (`SKILL.md:47`, `references/dialogue-manager.md:22-23`); C# events stay silent until C# touches `DialogueManager.Instance` (`dialogue-manager.md:125`); LimboAI's GDExtension build cannot be used from C#, only the module build ships NuGet (`SKILL.md:45`); `Blackboard.get_var` prints an error for a missing variable even with a default unless `complain = false` (`references/limboai.md:96`); `PhantomCameraHost` must be a child of the real camera (`SKILL.md:46`); `priority_override` is ignored in exports (`references/phantom-camera.md:54`); Beehave 2.9.3 `RepeaterDecorator.get_class_name()` returns the wrong name (`references/beehave.md:152`).
- Evidence: 0 listed. Fixes: none required; each reference opens with "Addon vX checked against Godot 4.x, date" and `SKILL.md` workflow step 1 says to compare `plugin.cfg` versions, which is the right decay control. Needs source check: addon versions and the Beehave bug claim.
- Boundary note: `SKILL.md` "Choosing an addon" defers BT theory to `game-ai`; after the merge point it at `game-craft`.

### godot-editor-tools — KEEP (medium-high), read in full
- Value: K-private. `EditorDock`/`add_dock` from 4.6, with a `ClassDB.class_exists` fallback that parses on 4.5 (`references/docks-and-ui.md:3,62`); 4.7 additions (`SKILL.md:36`); the editor runs about 10 Hz when unfocused, so an agent driving the editor from a terminal sees up to 100 ms per poll (`references/scene-editing-and-services.md:117`); breakpoints do not stop in tool scripts of the same editor, run a second editor via Debug > Customize Run Instances (`references/testing-plugins.md:35`); a non-`@tool` helper acts like an empty script (`SKILL.md:37`); `@tool` scripts ship in exports (`SKILL.md:38`); `HTTPServer` does not exist (`scene-editing-and-services.md:121`). This is directly relevant to the owner's godot-mcp setup, which is an editor-side server.
- Evidence: 2 sessions listed, 0 calls, 103 tokens.
- Fixes: [med] make `godot/references/tool-scripts.md` one paragraph plus a pointer here, to end the duplicated and divergent dock text.

### godot-mcp-setup — KEEP-FIX (medium)
- Value: Tooling. `scripts/install-addon.sh` does a pinned, hash-less, commit-verified install of a third-party addon; the spec (`tests/install-addon-spec.sh`) passes. Manual-only, so no listing cost.
- Evidence: manual, 0 loads in four weeks, no evals.
- Fixes:
  - [low] Symlink-member scan before extract (`install-addon.sh:86-88`).
  - [low] Wire the spec into `scripts/plugins.py check`, or note how to run it.
  - [med] Trust note in `SKILL.md`: the pinned commit is still third-party code that runs in the editor with the user's privileges, and `--commit` approval is only as good as the user reading the diff. Say this next to step 3.
  - [low] No eval; add the no-write-before-approval outcome case from the 10-23 report.

### game-publish — KEEP (medium)
- Value: K-private plus K-decision. `SKILL.md:14-18` credential rule (refuse to put the key in `app_build.vdf`), butler quirks (`:54-57`: `--hidden` only on new channel, auto-unzip), Steam rules dated October 2026 (`:44-49`, `:61`). The dated store numbers are post-cutoff and decay, so they need re-checking (needs source check).
- Evidence: 0 listed; 3 routing cases.
- Fixes: [low] name both Steam pages that disagree on 21 vs 30 days (`SKILL.md:44`); [med] credential-refusal outcome eval.

### The 12 game craft plugins, line by line (all read in full except the game-design and game-feel references)

Totals: the 12 plugins hold 4,079 lines (SKILL.md plus references). Evidence common to all: 7 sessions listed (gamedev-core members) or 0 (ai, assets, genres, prototype), 0 calls, 0 loads, 118 to 128 listing tokens each, 2 to 3 routing evals, no outcome eval. No factual errors found in any of them. The question is only whether a current model needs them.

Merge target: one `game-craft` plugin, one SKILL.md of about 100 lines (symptom to technique router plus the "what Sonnet would skip" checks below), references kept only where listed. Target size about 900 to 1,100 lines total (a 75% cut). `game-publish` stays separate.

**game-ai — SLIM, merge (medium).** Two to three most non-obvious lines:
- `references/behavior-trees.md:56`: a memory Sequence under a reactive selector resumes at its RUNNING action and skips its own guard, so "CanSeePlayer, MoveTo, Attack" keeps chasing after sight is lost.
- `references/utility-ai.md:44` (compensation factor) and `:16` (golden rule): the compensation factor `product + (1 - product) * mod * product` with `mod = 1 - 1/n` (Dave Mark), and the "every consideration returns 0..1" golden rule.
- `SKILL.md:96`: attack tokens as the fix for "unfair dogpile"; `SKILL.md:57` a reaction delay of 0.2 to 0.6 s reads as fair.
Keep: those three plus the BT `reset()` rule (`behavior-trees.md:11,60`), the FSM/BT/utility choice table, and the perception rules (about 70 lines). Drop `references/pathfinding.md` A* code and heuristics (`:5-58`), which Sonnet writes correctly, but keep the flow-field and placement-validation lines (`:61-75`, about 15 lines). Haiku loses the worked A*/steering pseudocode; Sonnet and Opus lose nothing measurable.

**game-architecture — SLIM, merge (medium).**
- `references/patterns.md:110`: build the item registry from an explicit list, not a directory scan, because exports rename and pack files (a classic Godot export bug).
- `references/patterns.md:144`: count gameplay tags (two stuns from two sources, one expiring must not clear the other) and key effects by `(effect id, source)` (`:133`).
- `references/save-systems.md:36-60` (atomic write with `.bak`, JSON number pitfalls: ints become floats, ids above 2^53 as strings, locale `1,5`, int dictionary keys come back as strings; never load user-writable engine resources).
Keep: `save-systems.md` whole (about 110 lines), the inventory "return the leftover, two passes" rules and the effect/modifier ordering (about 40 lines). Drop the fixed-step loop section, the FSM shapes and event-bus text (restated in `game-ai`, `godot/references/patterns.md` and `godot/references/signals-groups.md`). Overlap: `godot/references/save-and-config.md` already covers the same save rules (`:51` tmp file, `:91-110` version migration); keep the engine-neutral copy in one place and make the Godot reference point to it.

**game-assets — SLIM, merge (medium).**
- `references/pipelines.md:58`: in Godot texture filtering and repeat are not import options, set them on the node or project-wide; old "Flags > Filter" advice is Godot 3. Also "Detect 3D" flips a texture to VRAM Compressed (`:59`).
- `SKILL.md:20` and `pipelines.md:9`: never trust a generated grid, transparency, seam, pivot or dimension; generated animation frames drift unless made as one strip against a seed.
- `assets/asset-manifest.json` and `assets/art-direction-brief.md`: concrete templates with per-asset `license`, `source`, `prompt_or_source_record`.
Keep: the two templates, the Godot and Unity import checkpoints, the provenance list (about 120 lines). Drop the art-direction axis table (`references/art-direction.md:5-18`) and naming advice, generic. This is the only craft plugin with bundled artifacts, which is why it is worth keeping the templates even if the prose goes.

**game-audio — SLIM, merge (medium-high).**
- `SKILL.md:16`: about -24 LUFS (plus or minus 2) for console and PC per Sony ASWG-R001 and about -18 LUFS for mobile and handheld; `:53` music-streaming -14 LUFS is too hot for games. Models usually answer -14 or -23 EBU R128 here (UNVERIFIED which; needs source check on ASWG-R001).
- `SKILL.md:52` (slider as dB): `bus.volume_db = v` makes 0.5 mean +0.5 dB; convert through `linear_to_db` and mute at the bottom.
- `SKILL.md:20,57`: schedule beat-locked events from the audio playback position plus output latency, never accumulated frame delta.
Keep: workflow steps 2, 3 and 7 (`SKILL.md:15-20`), the ducking numbers, SFX voice limits, and a trimmed `adaptive-music.md` (hysteresis plus minimum dwell, bar-boundary switching), about 70 lines of 148. Drop the bus-tree and "work in decibels" restatement.

**game-genres — DEPRECATE, move two pieces (medium).** Quotes: `references/puzzle.md:51` (a random permutation of a sliding puzzle is unsolvable half the time by parity, scramble by inverse moves); `references/dialogue.md:32` (Yarn: declare every variable, an undeclared one compiles with an inferred type); `references/dialogue.md` Ink `*` once-only versus `+` sticky and the `Expression` caveat (never `eval` dialogue text, `const_calls_only` is not a sandbox).
Why deprecate: 891 lines in ten genre playbooks (card, fps, platformer, puzzle, roguelike, rpg, survival, tower defense, visual novel, dialogue), and most of the body repeats other plugins. Platformer jump math and coyote/buffer values duplicate `game-feel/SKILL.md:25-30` and `godot-physics/references/controllers.md`; FPS mouse-delta and recoil lines duplicate `game-feel/SKILL.md:64`; inventory `add_item` leftover and modifier order appear again in `rpg.md` and `survival-crafting.md` after `game-architecture`; drop-table weights repeat `game-design/references/economy.md:74-82`. A model asked "make a roguelike" already knows energy-based turn scheduling, BSP, FOV and drop tables. Haiku would lose genre checklists; the cost of a stale or contradicting copy outweighs it.
Keep in `game-craft`: `dialogue.md` (about 90 lines: Ink and Yarn syntax traps, custom runner with whitelisted evaluator, Godot `RichTextLabel.visible_characters` typewriter) and the "What every genre build needs first" 8-item list (`game-genres/SKILL.md:29-37`: seeded RNG per run, run state vs profile state, delta-scaled everything). Confidence medium; if the owner wants to keep any genre file, `puzzle.md` (solvability and undo) and `roguelike.md` (sub-seeds and connectivity pass) carry the most non-obvious content.

**game-performance — SLIM, merge (medium).**
- `references/profiling-and-budgets.md:17-35` and `SKILL.md:24-25`: classify GPU-bound vs CPU-bound first with the "halve the render resolution" test, re-measure and revert if the number did not move.
- `SKILL.md:42` (hitches): look at the 99th-percentile frame, not average FPS; mobile throttling means test 10 minutes sustained (`SKILL.md:54`).
- `profiling-and-budgets.md:115-122`: regression check recipe with baseline and tolerance.
Keep: the triage flow, the percentile/regression recipe and the hitch list (about 45 lines). Drop the pooling manager (`profiling-and-budgets.md:57-70`, a duplicate of `game-architecture/references/patterns.md:69-90` and `godot/references/patterns.md`) and the batching and allocation lists. This is the most "Sonnet already does it" skill: given "my game stutters" Sonnet asks for a profile and splits CPU/GPU. Value is mostly Haiku.

**game-playtest — SLIM, merge (medium).**
- `references/session-kit.md:108`: GEQ's factor structure is poorly supported (Law, Bruhlmann and Mekler, CHI PLAY 2018), prefer PXI; with under about 20 respondents report counts not means (`session-kit.md:110`).
- `SKILL.md:50`: concurrent think-aloud changes how people play in fast action, use retrospective think-aloud.
- `references/telemetry.md:117-120`: question-first events, `build_id` required, survivorship caveat, a DuckDB query over JSONL.
Keep: the test-plan, observer-sheet, severity-scale and readout templates (about 80 lines of `session-kit.md`) and the telemetry schema (40 lines). Drop the generic recruiting and consent prose except the checklist. These are artifacts a model produces unprompted in similar form; the templates and the GEQ/PXI caveat are the value.

**game-prototype — SLIM, merge (medium-low).**
- `SKILL.md:49`: on itch.io attach the game to the jam's submission form; uploading to your own page does not enter it.
- `SKILL.md:35-37`: keep and kill criteria written before coding ("kill when the verb only feels good after you explain it").
- `SKILL.md:51-73`: 48/72-hour scope table and hour schedule; reserve the last 20% for shipping (`:48`); pre-submit check on an extracted copy (`:74`).
Correction: it does not duplicate `prototype` (`prototype` is a web state-model and UI-variant tool). Keep jam mode (about 40 lines), compress spike mode to 8. Could instead fold into `game-publish` (both touch itch.io jam submission); `game-craft` is fine.

**game-ui — SLIM, merge, keep accessibility whole (medium-high).**
- `references/accessibility.md:83` and `:50`: flash thresholds from the Game Accessibility Guidelines (more than three flashes per second over 25% of the screen; stripes 5+ moving, 8+ static; red transitions) and subtitle numbers (about 46 px at 1080p, two lines, about 40 characters, backing box; body text about 28 px). "Numbers read from those pages on 2026-10-17" (`:4`). These are cited facts a model usually gives approximately.
- `references/layout-and-flow.md:33`: match-slider 0.5 default, 1.0 when vertical must never clip, 0.0 when horizontal must never clip.
- `SKILL.md:46`: no initial focus means a dead menu on a controller; restore focus on modal close (`layout-and-flow.md:47-52`).
Keep: `accessibility.md` whole (108 lines), the focus rules and screen stack (about 30 lines). Drop the scaling-mode tables and the localisation list (`godot/references/ui-control.md` and `localization.md` cover the Godot side). Best-value craft skill after game-audio.

**level-design — SLIM, merge (medium-high).**
- `references/procgen.md:21`: some languages randomise their built-in string hash per process, so a seed from text gives a different world each launch; use FNV-1a over UTF-8.
- `references/procgen.md:97-98`: WFC must detect a contradiction the moment any cell hits zero options; a loop that only looks at cells with more than one option reports success with holes. Also rules must be symmetric.
- `SKILL.md:43`: validate gate order with a gated flood fill (a key behind its own lock is a soft-lock).
Also: sub-seeds per system (`procgen.md:20`, `hash(world_seed, "loot")`), cellular automata written into a new grid per pass (`:74`), Poisson-disc over noise threshold. Keep `procgen.md` (about 110 lines of 190) and the gated-flood-fill and metrics rules (about 30 lines); drop `pacing-encounters.md` except the blockout review checklist (`pacing-encounters.md:81-92`, about 12 lines). The pacing sawtooth, teaching loop and encounter-role text is design-school boilerplate.

**game-design — SLIM, merge (medium-low).** Non-obvious lines: `SKILL.md:51` (a 10% drop leaves about 1 in 3 players with nothing after 10 tries, 0.9^10 = 0.35), `:50` shuffle bag or pity counter with seeded RNG, `:31` model numbers in a script across a full play-through and skill levels before tuning in-engine. Everything else (pillars, core loop, Sid Meier's test, faucets and sinks, GDD one-pager) is textbook that Sonnet writes unprompted. Keep about 60 lines: the artifact router, the simulation step and `references/balancing.md` section 7 script template (not read in full; UNVERIFIED), the economy checks. Haiku-tier loses the GDD template (`gdd-template.md`, 115 lines); keep a 30-line version.

**game-feel — SLIM, merge (medium-low).** Non-obvious lines: `SKILL.md:50`: hit-stop timer must ignore time scale or it never fires at scale 0; `:64`: never multiply mouse delta by `dt`; `:66`: a 2D camera node may ignore rotation, silently disabling shake roll; `:36` (`1 - exp(-rate*dt)` smoothing). Everything numeric (buffer 100-150 ms, coyote 80-120 ms, fall gravity 1.5-3x, `g = 2h/t^2`) is in `godot-physics/references/controllers.md` and `game-genres/references/platformer.md` too and is known to a current model. Keep about 40 lines: the "name the complaint as a symptom" step (`:14`), the gotchas (`:62-69`), the jitter section (`:54-60`); drop the juice presets and input numerics. `references/*` (camera, input, juice) skimmed, not read in full.

Net effect of the merge: the cross-plugin routing collisions (jitters, stutter, economy, state machine, procedural dungeon) disappear because there is one skill; the Godot route table gets a single "game-craft, if installed" row; the godot-meta suite needs its `plugins:` closure edited (gamedev-core would list `game-craft`, `evals/godot-meta/README.md` closure rule, `scripts/plugins.py check`).

Alternative, if the owner will not merge: deprecate game-genres, game-performance and game-design outright (highest Generic share, lowest private content), keep the other nine. That is the defensible minimum.


## Cross-plugin findings

- `game-craft` collapses the collisions the 10-23 report listed (game-feel vs godot-physics "jitters", game-design vs game-genres "economy", game-ai vs game-architecture "state machine", level-design vs game-genres "roguelike"). The godot-physics and godot entries remain the engine-API side.
- `godot/references/tool-scripts.md` and `godot-editor-tools` carry the same dock content with different version claims; keep one.
- `godot-csharp/SKILL.md:112-118` and `version-notes.md:97-105` duplicate the 4.7 C# list.
- Meta shape: `godot-meta` omits godot-csharp, godot-multiplayer and the niche five; that is reasonable (project-specific), but a C# Godot project gets none of them automatically. Add an optional `godot-csharp-meta` or document the manual install in the godot-meta README. `gamedev-core` would shrink to `game-craft` (or be deprecated).
- The 4.7-era facts are the family's real private content and they decay fastest. Add a "checked against 4.7.x on <date>" line in `version-notes.md:3` and a re-check trigger at each minor release.
- Duplicated blocks across the craft plugins (second-pass finding): coyote time and jump math in `game-feel/SKILL.md:25-30`, `game-genres/references/platformer.md:36`, `godot-physics/references/controllers.md:25-47`; object pooling in `game-architecture/references/patterns.md:69`, `game-performance/references/profiling-and-budgets.md:57`, `godot/references/patterns.md:115`; save rules in `game-architecture/references/save-systems.md` and `godot/references/save-and-config.md`; inventory `add_item` rules in `game-architecture/references/patterns.md:104`, `rpg.md` and `survival-crafting.md`. Three copies of each means a fix lands in one and the others drift.
- Listing cost: godot-meta plus gamedev-core installs 14 model-invocable skills (about 1,700 listing tokens) in a project the owner opens in 7 to 9 sessions per month with no calls.

## Needs source check

- Godot 4.7-stable shipped 2026-06-18, latest 4.7.2 (10-23 report claim; not re-fetched). The 4.5 vs 4.6 `add_dock` and Node2D facts above are checked against the class XML at the stable tags.
- SoftBody3D whole-body mass and Jolt interpretation (`godot-physics/SKILL.md:104`).
- Steam app-fee wait, 21 vs 30 days (`game-publish/SKILL.md:44`).
- Godot-mcp upstream commit and addon behaviour (`voidrot/godot-mcp`), not checked this pass.
- Unverified rows in `version-notes.md:44,58,72,93,111-114`, already flagged in the file.
- `godot-testing` and `godot-export` action pin policy (now confirmed as a real inconsistency, only the right policy is a decision).
- godot-cpp 10.0.0-stable date, gdext 0.5.5 date, GUT 9.7.1 / gdUnit4 6.2.2 release dates and support table (`godot-testing/references/gut.md:11`, `gdunit4.md:11`), Beehave 2.9.3 `get_class_name` bug, Limbo 1.8.1, Dialogue Manager 4.1.0: all stated in the references as checked 2026-10-17; not re-checked here.
- Sony ASWG-R001 loudness numbers (`game-audio/SKILL.md:16`) and the Game Accessibility Guidelines flash and subtitle numbers (`game-ui/references/accessibility.md:50,83`).

## Read depth

Read in full on the second pass (SKILL.md plus every reference and script): game-ai, game-architecture, game-assets, game-audio, game-genres, game-performance, game-playtest, game-prototype, game-ui, level-design, godot-addons, godot-editor-tools, godot-export, godot-gdextension, godot-multiplayer, godot-physics, godot-testing, godot-xr (plus, in the first pass, godot SKILL.md and version-notes, godot-csharp SKILL.md 20-130, godot-shaders SKILL.md, godot-mcp-setup SKILL.md and script, game-publish SKILL.md).

Still not fully read: the 21 `godot/references/*` files except version-notes, camera (grep), tool-scripts (lines 85-112), audio (grep), save-and-config and patterns (grep); `godot-csharp/references/*` (3 files, 260 lines); `godot-shaders/references/*` (4 files); `game-design/references/*` and `game-feel/references/*` (skimmed, one economy.md head only); `game-publish/references/*`; the hands-and-passthrough and `godot-csharp` pitfalls table. The verdicts for godot, godot-csharp, godot-shaders, game-design, game-feel and game-publish therefore rest on SKILL.md plus sampled references.
