# Batch godot-1a report

## Plugin created

| Name | Type | Description (plugin.json) | Sources | Deps |
| --- | --- | --- | --- | --- |
| godot | skill (`skills/godot/SKILL.md`, 113 lines, 21 references) | Godot 4 entry point: GDScript, nodes and scenes, signals, custom Resources, autoloads, project.godot and safe .tscn/.tres edits (uid:// and .uid files), with references for 2D, 3D, UI, input, audio, animation, saves, performance and debugging, and routing to the other godot plugins and the editor MCP. | awesome-gamedev-agent-skills @ 0a70cfc (Apache-2.0); GodotPrompter @ bd9d180 (MIT); Qb-Lab/godot-agent-skills @ 7f94393 (MIT, cloned to scratchpad gamedev-src/); wshobson/agents @ 044b4b2 (MIT) | none |

SKILL.md frontmatter description (model-facing, 345 chars): "Writes, reviews and debugs Godot 4 projects (GDScript, nodes and scenes, signals, Resources, autoloads, .tscn/.tres files with uid:// and .uid sidecars). Use for any work in .gd, .tscn, .tres or project.godot, "add X to my Godot game", porting Godot 3 code or a Godot error, before routing to physics, shader, export, test, C# or networking skills."

References (21, each at most 150 lines): gdscript, scenes-and-resources, signals-groups, tscn-tres-format, patterns, animation, audio, ui-control (with HUD), input-map, 2d (tilemap folded in), 3d-scene, camera, navigation, localization, import-pipeline, save-and-config, performance, threading, tool-scripts, debugging, version-notes. That is within the review's 1a target of 18 to 22.

Files: plugins/godot/{.claude-plugin/plugin.json, LICENSE (Apache-2.0), LICENSE-MIT (GodotPrompter, Qblab, Seth Hobson notices), NOTICE (Upstream/Paths lines for all four sources plus a Modifications paragraph), skills/godot/SKILL.md, skills/godot/references/*.md, evals/ (4 cases)}.

## Validation

- `claude plugin validate --strict plugins/godot`: passed.
- Every NOTICE `Paths:` entry was checked to exist at the recorded commit's checkout.
- Every `references/x.md` link resolves. The grep for codegraph, claude-mem, coding-core:, github: and "Efficient " finds nothing, and there are no C# code blocks.
- The descriptions contain no `4.N` version.
- Evals (not run): trigger-godot-1 (Godot 3 style signal bug), trigger-godot-2 (safe node rename across .tscn), godot-vs-unity (hard negative), godot-vs-shaders (hard negative: .gdshader belongs to godot-shaders).

## Deviations

- Threading kept as its own `threading.md`, because the caller's list names it. The review instead suggested folding it into performance.md. `2d.md` absorbs tilemap and the HUD lives in `ui-control.md`, as the review said, which gives 21 files.
- `signals-groups.md` is kept separate instead of being folded into scenes.
- Only GDScript is included. C# goes to `godot-csharp` through pointers.
- The SKILL.md's "Editor MCP" section follows design 3.1. It defers to the project's `godot-mcp` skill and never repeats the tool table. It adds the addon's fact that Godot exits 0 after a script error.
- Four evals instead of three.
- Long references got a one-line "Contents:" index to satisfy the skill-authoring rule on files over 100 lines.
- The references were written by me plus three forked helpers working in parallel on disjoint files. I reviewed their output, fixed the object pool typing in patterns.md (`hide()` on a plain Node) and trimmed it to 150 lines.

## Stale API fixed

- print_debug: it prints in every build.
- CanvasGroup: it does not batch. `OS.gc()` does not exist, and GDScript is refcounted.
- Textures: filter and repeat are not import flags. The compress default is Lossless. The occluder suffixes are -occ/-occonly. Committing .uid files is now covered.
- Camera2D: a roll needs `ignore_rotation = false`, and smoothing uses exp-decay.
- `is_action_just_pressed` is tick-aware.
- NavigationAgent2D: `path_desired_distance` defaults to 20. The enemy is no longer parented under the region.
- Editor plugins: `add_dock(EditorDock)` is checked against the 4.7 class reference. `@tool` scripts do ship. `#if TOOLS` wraps editor-only classes only.
- Collision shapes must not sit under a plain Node.
- There is no `make_unique()`. The 4.5 `duplicate_deep` change is now covered.
- The nested FSM no longer starts itself.
- Saves use atomic writes with a .bak, and user .tres files are never loaded.
- `list_directory` replaces `DirAccess` scans.
- `push_error` replaces `assert`.
- The 4.6 TSCN changes are covered: `load_steps` and `unique_id`, both verified on the 4.7 TSCN page and in the 4.6 migration guide.

## Verified (Context7 /websites/godotengine_en_4_7)

- The TSCN format: `load_steps` deprecated, `unique_id`, the ext_resource uid attribute, format=3 vs 2.
- Packed-array element writes no longer call the setter (4.7).
- Typed-array assignment rules.
- `@abstract` and variadics (4.5).
- The `duplicate_deep` modes and the 4.5 behaviour change.
- `@export_file` storing uid:// (4.4) and `@export_file_path` (4.5).
- TileMapLayer physics chunking (4.5).
- Android C# needs .NET 9 (4.5). This resolves one of the review's open items.
- Jolt as the default for new projects (4.6) and the Jolt changes in 4.7.
- The 4.7 GUI breaks for RichTextLabel and accessibility_live.
- `is_class` takes a StringName and `OptimizedTranslation.generate` now returns bool.
- `ResourceLoader.list_directory`, `get_node_count_in_group` and `EditorDock`.
- The forks checked their own topics; see their rows in version-notes.md.

## Unverified / TODO

These are marked "(unverified)" in the files:

- `type_exists()` deprecation: the 4.7 class reference does not mark it, so the files recommend `ClassDB.class_exists()` anyway.
- The `JSON.stringify` empty-dict change.
- The 4.7 threaded-load fixes.
- `AudioStreamInteractive.TRANSITION_TO_TIME_PREVIOUS_POSITION`.
- `EnableGodotDotNetPreview`.
- The 4.5 independent 2D navigation server.
- 4.7 `map_get_closest_point_normal` being normalized.
- The 4.7 `ImportFlags` enums.
- The IKModifier3D solver list.
- The exact version that introduced: `AudioStreamWAV.load_from_file`, `volume_linear` and `screen_relative`.
- Some 3D details from GodotPrompter: GridMap octant names, AgX property names, `use_legacy_blending` and `DrawableTexture2D`.
- The `format=4` header note in tscn-tres-format.md is phrased generally ("4.3+ may write a newer format number"). Its basis is the 4.3 base64 PackedByteArray change; the exact header value was not confirmed in the docs.

## Follow-ups

- Run `claude plugin eval plugins/godot` once the coordinator registers it, ideally with godot-shaders installed so the routing case is meaningful.
- Coordinator: register `godot` in the marketplace and add it to `godot-meta`. Add the GodotPrompter and Qb-Lab upkeep lines (`git -C 3rd-party/godot-prompter log bd9d180..HEAD -- skills`).
- The design's description-version check (fail on `4.[0-9]` in godot-* descriptions) is still unimplemented in scripts/plugins.py.

## Coordinator notes from gamedev-3 (added after verification against the Godot 4.7 docs, Context7)

- performance.md, new "Hitches and frame pacing" section:
  - **Shader stutter:** first-use stutter and the ubershaders and pipeline precompilation that 4.4+ uses against it (Forward+ and Mobile). Load and instance effects during loading screens. The section lists the Pipeline Compilations monitors (Canvas, Mesh, Surface, Draw, Specialization). Compatibility uses the spawn-in-front-of-camera warm-up instead.
  - **Shader Baker (4.5+):** an export option for Forward+ and Mobile only. It does not work for web or `--headless` exports, and it bakes only for drivers the host OS supports. It cuts startup time but does not fix in-game stutter. The shader cache setting is covered too.
  - **Frame cap:** `application/run/max_fps` (read at startup, overridden by `--max-fps`) and `Engine.max_fps` at runtime. The cap cannot exceed the refresh rate while V-Sync is on. On VRR monitors the docs recommend capping at `r - r*r/3600`.
  - **V-Sync:** `display/window/vsync/vsync_mode` and `DisplayServer.window_set_vsync_mode`. Modes other than Enabled need Forward+ or Mobile.
  - **Interpolation:** the section points at physics interpolation for uneven motion at a steady FPS.
- animation.md: a hit-stop line. It lowers `Engine.time_scale` and restores it after `await get_tree().create_timer(d, true, false, true).timeout`. The signature (time_sec, process_always, process_in_physics, ignore_time_scale) was verified on the SceneTree class reference. The line points to `game-feel` for timing.
- Jump formulas: the godot references contain none, so there was nothing to repoint. camera.md is unchanged.

## Coordinator note from godot-2b (C# 4.7 breaks)

version-notes.md has a new "4.7 C# breaks" subsection, which replaces the earlier one-row C# entry. It points to the `godot-csharp` skill "if installed" for detail and has one line per break. I checked each line against the 4.6 to 4.7 migration page on docs.godotengine.org/en/4.7:

- `Animation.Length` is now a double (GH-116394).
- `Control.AccessibilityLive` uses the `AccessibilityServer` enum (GH-116839).
- In RichTextLabel `AddImage`/`UpdateImage`, `widthUnit`/`heightUnit` replace the percent parameters, and `ImageUpdateMask` `WidthUnit` replaces `WidthInPercent` (GH-112617).
- The `EditorSceneFormatImporter` `Import*` constants moved into the `ImportFlags` enum (GH-115788).
- `AudioEffectSpectrumAnalyzer.TapBackPos` was removed (GH-114355). This one breaks GDScript too.

The `GLTFDocument` ImportFlags change does not appear on the migration page, so it stays marked unverified.

`claude plugin validate --strict plugins/godot` passed after this change.
