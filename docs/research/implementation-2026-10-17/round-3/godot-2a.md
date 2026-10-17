# Batch godot-2a report

Plugins: `godot-physics`, `godot-shaders`, `godot-export`. All three are skills in `godot-meta` (per design section 4). None have dependencies.

## Plugins created

| name | type | description (= plugin.json) | sources | deps |
|---|---|---|---|---|
| godot-physics | skill | Godot 4 physics skill: CharacterBody controllers and move_and_slide, rigid, static, animatable and area bodies, collision layers and masks, raycasts and space queries, physics interpolation and Jolt, with references for controller recipes, queries, ragdolls and soft bodies. | awesome-gamedev-agent-skills @ 0a70cfc (godot-2d-movement, godot-physics, Godot parts of disciplines/physics-tuning), Apache-2.0; GodotPrompter @ bd9d180 (physics-system, player-controller), MIT | none |
| godot-shaders | skill | Godot 4 shaders and VFX skill: .gdshader canvas_item, spatial and particles shaders, uniforms and hints, screen and depth reading, visual shaders and materials, GPU particles, with references for shader fundamentals, effect recipes, particles, stencil, CompositorEffect and the Shader Baker. | awesome-gamedev-agent-skills @ 0a70cfc (godot-shaders, disciplines/shader-programming), Apache-2.0; GodotPrompter @ bd9d180 (shader-basics, particles-vfx), MIT | none |
| godot-export | skill | Godot 4 export skill: export templates and presets, headless CLI exports, Web threads and COOP/COEP, Windows and macOS signing, dedicated-server builds, PCK patches and the Shader Baker, with references for CLI and presets, Android and iOS, and CI export jobs. | awesome-gamedev-agent-skills @ 0a70cfc (godot-export), Apache-2.0; GodotPrompter @ bd9d180 (export-pipeline, mobile-development, export part of dedicated-server), MIT | none |

Layout of each: `.claude-plugin/plugin.json`, `skills/<name>/SKILL.md` + `references/`, `evals/` (2 trigger cases + 1 hard negative), `LICENSE` (Apache-2.0 full text), `LICENSE-MIT` (GodotPrompter copyright), `NOTICE` (with the `Upstream: <url> @ <sha>` / `Paths:` lines for both sources, plus a modifications paragraph).

References:
- godot-physics: `controllers.md` (211 lines, has TOC), `queries.md`, `bodies-advanced.md`. SKILL.md 126 lines.
- godot-shaders: `fundamentals.md`, `recipes.md`, `particles.md`, `advanced.md` (stencil, CompositorEffect, Shader Baker, pipeline precompilation, AA). SKILL.md 130 lines.
- godot-export: `presets-and-cli.md`, `mobile.md`, `ci.md`. SKILL.md 91 lines.

Skill descriptions (frontmatter) are 313 to 343 characters, say "Godot 4" only (no minor version), and put "Not for" lists in the body.

## Validation and tests

- `claude plugin validate --strict plugins/godot-physics` / `godot-shaders` / `godot-export`: all pass.
- `python3 .claude/skills/skill-authoring/scripts/validate_skill.py plugins/<name>/skills/<name>`: all valid (fields, links).
- Grep for `codegraph`, `claude-mem`, `coding-core:`, `github:`, `Efficient `, old upstream skill names (`physics-tuning`, `godot-2d-movement`, `steam-publish`, `shader-programming`, `export-pipeline`, ...) outside NOTICE: no hits.
- No scripts or mods, so no `claude plugin test` / `bun test`. Evals were written but not run (`claude plugin eval` not run, to save cost; the coordinator's post-batch eval run with the full `godot-meta` covers the layered pairs).

## Facts checked (Godot 4.7 stable docs, migration guides 4.4 to 4.7, GitHub PRs via `gh`, 4.7-stable engine source)

- CLI (`command_line_tutorial`): `--headless`, `--export-release/--export-debug/--export-pack/--export-patch/--patches`, `--install-android-build-template`, `--import`, `--build-solutions`; target dir must exist; relative paths resolve from the project dir; `--quit-after` counts iterations; `--check-only` needs `--script`.
- Web: single-threaded default since 4.3; `variant/thread_support` and Extensions Support need COOP/COEP; PWA `ensure_cross_origin_isolation_headers`; C# can't export to Web; Compatibility only.
- Export credentials live in `.godot/export_credentials.cfg`; PCK encryption needs custom-compiled templates; Android env vars `GODOT_ANDROID_KEYSTORE_*`, Windows `GODOT_WINDOWS_CODESIGN_*`; Android SDK versions for 4.7; JDK 17; editor seeds SDK paths from `JAVA_HOME`/`ANDROID_HOME` (engine source).
- 4.7 PRs: GH-114930 `[runnable_presets]`, GH-118283 OBB removal, GH-116553 APK/AAB base packs, GH-113920 sparse PCK index encryption, GH-119172 Gradle build not experimental, GH-118962 `textureQueryLod` fragment-only, GH-104736 one-way direction; 4.5: GH-75950 rcedit removal; Jolt default GH-105737 (4.6); interpolation GH-88424 (2D, 4.3), GH-92391 (3D, 4.4), GH-104269 (SceneTree, 4.5); `get_gravity()` absent in 4.2 docs, present in 4.3.
- 4.7 migration guide: the three Jolt changes, LinearToSRGB no longer clamps, `AudioStreamPlayer.area_mask` default 0.
- Shader Baker (pipeline_compilations page): host-OS driver limits, Forward+/Mobile only, **not supported with `--headless`**, off for dedicated server.
- Stencil: `stencil_mode` flags from `servers/rendering/shader_types.cpp` at 4.7-stable (`write_depth_fail`; the spatial shader docs table says `write_if_depth_fail`, which looks like a docs typo), reads only in the transparent pass, experimental.
- Class refs: CharacterBody2D/3D defaults, RigidBody CCD types, CollisionShape2D one-way props, GPUParticles defaults (`fixed_fps` 30, `amount` restart note, `amount_ratio` gives no perf benefit), ParticleProcessMaterial members and color notes, CompositorEffect callbacks and buffer flags, Node notification ids, `OS.request_permission`, `DisplayServer` safe area, JavaClassWrapper `create_proxy`/`create_sam_callback`, PCKPacker `add_file_from_buffer`, `chickensoft-games/setup-godot` inputs (`use-dotnet` defaults true; version needs patch).

## Deviations from the plan

- Wrote files by hand (no `plugins.py new`), per round-3 brief.
- godot-shaders has 4 references (design: 2, review: 3): `fundamentals.md` (design's name; upstream shading-language + shader-programming), `recipes.md` and `advanced.md` (review), `particles.md` (review). Merging any two would make one reference load for unrelated tasks.
- godot-physics has 3 references (design: 2): the review's `bodies-advanced.md` was added beside `controllers.md` and `queries.md`. `controllers.md` is 211 lines (it has a TOC).
- Upstream errors fixed on port (beyond the review's list): Jolt single-body joint convention was backwards in GodotPrompter; GodotPrompter's "Shader Baker runs in `--headless` CLI exports" is false per docs; `amount_ratio` as a quality/perf slider (docs: no perf benefit); particle `color` "overrides" `color_ramp` (they multiply; real trap is `vertex_color_use_as_albedo`); `attractor_interaction_enabled` "off" (defaults on); upstream `TIME` "keeps growing" (wraps at 3600 s); upstream "secrets live in export_presets.cfg" and "set an encryption key and enable encryption" (needs custom templates); EditorScript run via `--script` for version injection (doesn't work); CompositorEffect credited for SDFGI/VoxelGI (dropped).
- GodotPrompter's "Android C# export requires .NET 9+" was not verifiable in the docs; replaced with a pointer to the C# platform-support docs.
- No `godot` skill exists yet in the tree; the bodies point at "the `godot` skill's version notes" by name.

## Unverified or TODO

- `write_depth_fail` vs the docs' `write_if_depth_fail`: taken from engine source; not compiled locally (no Godot binary on this machine). Worth reporting as a docs bug upstream.
- None of the GDScript/shader samples were run in an engine (no `godot` installed). They were written against the 4.7 class reference.
- Shader Baker under a virtual display in CI: docs only say headless is unsupported; ci.md flags the Xvfb route as needing verification.
- Evals not run.

## Suggested follow-ups

- Run the trigger evals with the full `godot-meta` installed, especially `godot-physics` vs `game-feel` and `godot-shaders` vs `godot` (a material question).
- When `godot` lands, make sure its `version-notes.md` carries the 4.5 to 4.7 rows these bodies cite (runnable_presets, OBB, Jolt changes, textureQueryLod, LinearToSRGB, area_mask).
- Consider a docs issue/PR to godotengine/godot-docs for the `write_if_depth_fail` table entry.
- The design's version-pin check (fail on `4.[0-9]` in `godot-*` descriptions) passes for these three; note `godot-mcp-setup`'s plugin.json description names "4.7+".
