# Version notes

Notable and breaking changes per Godot 4 minor release, so code matches the project's version (`config/features` in `project.godot`). Rows were checked against the official "Upgrading from 4.x to 4.y" pages and class reference for 4.7 unless marked (unverified). Other godot-* skills link here instead of repeating these. When a new minor ships, add a section from its migration page.

## Contents

- Reading the version
- 4.3
- 4.4
- 4.5
- 4.6
- 4.7
- Unverified claims seen in sources

## Reading the version

- `config/features=PackedStringArray("4.7", "Forward Plus")`: the first token is the minor the project was last saved with; `godot --version` gives the local binary.
- An older project opened in a newer editor keeps its old defaults (stretch mode, physics engine, rendering driver) because they are stored in `project.godot` only when changed. "Default for new projects" rows don't change existing projects.
- Project > Tools > Upgrade Project Files resaves every scene and resource in the current format in one commit, which avoids drip-fed diffs.

## 4.3

| Area | Change | Do |
| --- | --- | --- |
| 2D | `TileMapLayer` replaces `TileMap` layers (TileMap deprecated) | One `TileMapLayer` node per layer; see `references/2d.md` |
| 2D | `Parallax2D` replaces `ParallaxBackground`/`ParallaxLayer` | Use `Parallax2D` for new work |
| Physics | 2D physics interpolation (`physics/common/physics_interpolation`) | See `godot-physics` |
| Files | Large `PackedByteArray`s may be stored base64; files can't be opened by older 4.x patch releases | Keep the team on one editor version |
| GUI | `Node.auto_translate_mode` replaces `auto_translate` | See `references/localization.md` |
| Export | Web exports can run without threads (preset Thread Support option) | See `godot-export` |

## 4.4

| Area | Change | Do |
| --- | --- | --- |
| Files | Scripts, shaders and other header-less files get `.uid` sidecar files | Commit them; move them with their file; see `references/tscn-tres-format.md` |
| GDScript | Typed dictionaries `Dictionary[K, V]` | Prefer them over untyped `Dictionary` |
| GDScript | `@export_file` stores `uid://` paths when set in the Inspector | Code that expects `res://` must resolve with `ResourceUID`, or use 4.5's `@export_file_path` |
| GDScript | `@export_tool_button` | Inspector buttons for `@tool` scripts |
| IO | `FileAccess.store_*` return `bool` (C# binary break) | Check the result |
| IO | `JSON.from_native()`/`to_native()` | Encode engine types for saves; see `references/save-and-config.md` |
| Resources | `ResourceLoader.list_directory()` lists original names in exports | Use it instead of `DirAccess` scans of `res://` |
| Physics | 3D physics interpolation; Jolt Physics built in as an option | See `godot-physics` |
| Audio | `AudioStreamWAV.load_from_file()` (version unverified) | Runtime WAV loading |

## 4.5

| Area | Change | Do |
| --- | --- | --- |
| GDScript | `@abstract` classes and methods; variadic functions (`...args`) | See `references/gdscript.md` |
| GDScript | `@export_file_path` keeps plain `res://` paths | Use where code parses paths |
| Resources | `duplicate(true)` no longer copies external sub-resources | `duplicate_deep(Resource.DEEP_DUPLICATE_ALL)` for the old behaviour |
| 2D | TileMapLayer physics chunking on by default (`physics_quadrant_size` 16); `get_coords_for_body_rid()` is less precise | Set `physics_quadrant_size = 1` for exact cell lookups |
| Physics | Jolt: `areas_detect_static_bodies` setting removed; Area3D always reports static bodies | Filter with layers and masks |
| GUI | `RichTextLabel.add_image()`: `size_in_percent` now feeds only `width_in_percent` | Pass `height_in_percent` explicitly |
| GUI | `FoldableContainer`; stacked outlines and shadows in `LabelSettings` | See `references/ui-control.md` |
| C# | Android C# exports need .NET 9 (other platforms .NET 8+) | See `godot-csharp` |
| Navigation | NavigationServer2D independent of the 3D server (unverified) | n/a |
| Rendering | Stencil in shaders, Shader Baker, SMAA | See `godot-shaders` and `godot-export` |

## 4.6

| Area | Change | Do |
| --- | --- | --- |
| Files | `.tscn` no longer writes `load_steps`; nodes get `unique_id=` | Expect large diffs on first resave; see `references/tscn-tres-format.md` |
| Physics | Jolt is the default 3D engine for new projects (`physics/3d/physics_engine`) | Existing projects keep their setting |
| Rendering | New projects on Windows default to D3D12 | `rendering/rendering_device/driver.windows` |
| Rendering | Glow: blend mode default Screen, `glow_intensity` 0.8 to 0.3, new `glow_levels`; Mobile glow rewritten | Retune glow after upgrading; see `references/3d-scene.md` |
| Rendering | Volumetric fog blending more physically accurate (brighter); `ssr_depth_tolerance` 0.2 to 0.5 | Retune fog and SSR |
| IO | `FileAccess.get_as_text()` loses `skip_cr` | Drop the argument |
| i18n | CSV translations gain `?context`, `?plural` columns and `?pluralrule` rows | See `references/localization.md` |
| Animation | IKModifier3D solvers (unverified list) | See `references/animation.md` |

## 4.7

| Area | Change | Do |
| --- | --- | --- |
| GDScript | An override of a typed-return method inherits the return type; a missing `return` is an error | Add explicit returns |
| GDScript | Writing a packed-array property element no longer calls the property setter | Copy, modify, reassign; heed `CONFUSABLE_TEMPORARY_MODIFICATION` |
| Core | `Object.is_class()` takes `StringName`; `OptimizedTranslation.generate()` returns `bool` | C# rebuild |
| GUI | New projects default to stretch `canvas_items` + `expand`; old projects keep `disabled` + `keep` | Check `display/window/stretch/*` |
| GUI | `custom_maximum_size`, `offset_transform_*` (needs `offset_transform_enabled`), `Control.translation_context` | See `references/ui-control.md` |
| GUI | `RichTextLabel.add_image()`/`update_image()`: `width_in_percent`/`height_in_percent` become `width_unit`/`height_unit` (`ImageUnit`); `UPDATE_WIDTH_IN_PERCENT` renamed `UPDATE_WIDTH_UNIT` (GDScript break) | Update calls and enum names |
| GUI | `accessibility_live` uses `AccessibilityServer.AccessibilityLiveMode` (C# break); `TabContainer.all_tabs_in_front` deprecated | C# rebuild |
| Input | Keyboard and mouse events use `InputEvent.DEVICE_ID_KEYBOARD` and `DEVICE_ID_MOUSE`, not device 0 | Fix device checks; see `references/input-map.md` |
| Input | `VirtualJoystick` node; joypad motion sensors | See `references/input-map.md` |
| Audio | `area_mask` on AudioStreamPlayer2D/3D defaults to 0 (was 1), so Area `audio_bus_override` stops applying | Set `area_mask` back to 1 where Areas reroute audio |
| Animation | BlendSpace1D/2D `sync` replaced by `sync_mode`; SpriteFrames `LoopMode` (ping-pong) replaces the loop bool; `Tween.has_tweeners()` | See `references/animation.md` |
| 2D | Antialiased lines no longer add the feather | Re-check thin line art |
| 3D | `AreaLight3D`; HDR output (`display/window/hdr/request_hdr_output`); `roughness_layers` back to 8 | See `references/3d-scene.md` |
| Physics | Jolt: `WorldBoundaryShape3D.plane.d` sign flipped to Godot's convention; SoftBody3D stiffness reworked | Flip the sign; retune soft bodies (see `godot-physics`) |
| Import | Font `hinting` default 1 to 3; import a 3D file as a Mesh or MeshLibrary | See `references/import-pipeline.md` |
| Navigation | `map_get_closest_point_normal()` returns a normalized vector (unverified) | See `references/navigation.md` |
| Editor | `EditorPlugin.add_control_to_dock()` deprecated; use `add_dock(EditorDock)` | See `references/tool-scripts.md` |
| Particles | `request_particles_process()` gains `process_time_residual` | See `godot-shaders` |

### 4.7 C# breaks

Checked against the 4.6 to 4.7 migration guide. Each breaks C# source compatibility (some also binary), so update the code and rebuild. For detail, see the `godot-csharp` skill if installed.

- `Animation.Length` is now `double` (GH-116394): `float len = anim.Length;` no longer compiles.
- `Control.AccessibilityLive` is typed `AccessibilityServer.AccessibilityLiveMode`, not the `DisplayServer` enum (GH-116839).
- `RichTextLabel.AddImage`/`UpdateImage`: `widthInPercent`/`heightInPercent` become `widthUnit`/`heightUnit` (`RichTextLabel.ImageUnit`); `ImageUpdateMask.WidthInPercent` becomes `WidthUnit` (GH-112617).
- `EditorSceneFormatImporter` `Import*` constants moved into the `ImportFlags` enum (GH-115788; GDScript unaffected). The matching `GLTFDocument` flags change is unverified.
- `AudioEffectSpectrumAnalyzer.TapBackPos` removed (GH-114355; GDScript `tap_back_pos` breaks too).

## Unverified claims seen in sources

Do not rely on these without checking the class reference for the project's version:

- `type_exists()` deprecated in 4.7 in favour of `ClassDB.class_exists()` (the 4.7 class reference does not mark it). Prefer `ClassDB.class_exists()` anyway.
- `JSON.stringify` writing an empty dictionary differently in 4.7.
- 4.7 threaded-loading deadlock fixes; `AudioStreamInteractive.TRANSITION_TO_TIME_PREVIOUS_POSITION`.
- `EnableGodotDotNetPreview` in `.csproj`.
