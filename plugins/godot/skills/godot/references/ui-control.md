# UI and Control nodes

Control layout (anchors, containers, size flags), themes, focus navigation, resolution and stretch settings, HUD wiring, and the 4.5 to 4.7 Control changes. UX design (menu flow, readability, game accessibility) belongs to the `game-ui` skill. Written for Godot 4.x, checked against 4.7.

Contents: Layout rules; Themes; Focus and gamepad; Input and pause; Resolution and stretch; Text; HUD; 4.7 additions worth knowing; Pitfalls.

## Layout rules

- Build UI from `Control` nodes, never `Node2D`. Controls have a rect, anchors, theming and focus.
- Anchors are fractions (0 to 1) of the parent rect; offsets are pixels from the anchored point. Set both with `anchors_preset = Control.PRESET_FULL_RECT` (or CENTER, TOP_WIDE, BOTTOM_RIGHT) or the editor's Layout menu, then nudge offsets.
- Anchors at 0 with only `position` set do not follow window size.
- Inside a `Container`, the container owns position and size. Children use `size_flags_horizontal`/`size_flags_vertical` (`SIZE_FILL`, `SIZE_EXPAND_FILL`, `SIZE_SHRINK_BEGIN/CENTER/END`) and `size_flags_stretch_ratio`. To free-place a child, take it out of the container.
- Godot 3's `rect_size`, `rect_position` and `rect_min_size` are `size`, `position` and `custom_minimum_size`.

| Container | Arranges |
| --- | --- |
| `VBoxContainer` / `HBoxContainer` | Stack; `separation` theme constant |
| `GridContainer` | Grid with `columns` |
| `MarginContainer` | Margins via `margin_*` theme constants |
| `CenterContainer` | One child centred at its min size |
| `PanelContainer` | Panel stylebox behind one child |
| `ScrollContainer` | Scrolls oversized content |
| `TabContainer` | Tabbed pages |
| `AspectRatioContainer` | Keeps a child's aspect |
| `HSplitContainer` / `VSplitContainer` | Draggable split |
| `HFlowContainer` / `VFlowContainer` | Wraps like text |
| `FoldableContainer` (4.5+) | Accordion: `title`, `folded`, `folding_changed(is_folded)` |

4.7+ sizing: `custom_maximum_size` (default `Vector2(-1, -1)`, no cap) limits size per axis and wins over `custom_minimum_size`; `propagate_maximum_size` lets a parent's maximum constrain its children; override `_get_maximum_size()` to compute it.

## Themes

- Put one `Theme` resource on a top Control; the subtree inherits it. Theme items are `color`, `constant`, `font`, `font_size`, `icon`, `stylebox`, keyed by control type.
- Per-node overrides: `add_theme_color_override("font_color", c)`, `add_theme_font_size_override("font_size", 24)`, `add_theme_stylebox_override("panel", sb)`, `add_theme_constant_override("separation", 16)`; remove with `remove_theme_*_override`. Heavy per-node overriding defeats the theme.
- Styleboxes: `StyleBoxFlat` (fill, border, corners, shadow), `StyleBoxTexture` (9-patch), `StyleBoxEmpty`.
- 4.5+: `LabelSettings` stacks several outlines and shadows on one `Label`. `RichTextLabel` has no equivalent.

## Focus and gamepad

- Nothing focused means directional input does nothing. Call `grab_focus()` on the first control when a menu opens (and again when it reopens).
- `Button` already defaults to `FOCUS_ALL`. Set `focus_mode = FOCUS_NONE` on decorative controls and `FOCUS_ALL` on custom interactive ones.
- Automatic neighbours follow geometry. Set `focus_neighbor_top/bottom/left/right` and `focus_next/focus_previous` (NodePaths) where the guess is wrong.
- The built-in `ui_up/down/left/right/accept/cancel/focus_next` actions drive focus, mapped to arrows, Enter and the D-pad by default.

## Input and pause

- A full-rect Control with the default `MOUSE_FILTER_STOP` swallows clicks meant for the game below. Use `MOUSE_FILTER_IGNORE` on decorative panels and HUD roots, `MOUSE_FILTER_PASS` to handle and pass on.
- `gui_input(event)` handles clicks and drags on one control. GUI consumes events before `_unhandled_input` (see `references/input-map.md`).
- Pause menus: set the menu root to `process_mode = PROCESS_MODE_ALWAYS`, then `get_tree().paused = true`. Otherwise the menu freezes with the game.

## Resolution and stretch

Project Settings > Display > Window. Use the full keys in `project.godot` and in code.

| Key | Typical value |
| --- | --- |
| `display/window/size/viewport_width`, `viewport_height` | Design resolution, such as 1920x1080 or 320x180 |
| `display/window/stretch/mode` | `canvas_items` for most games; `viewport` for pixel art; `disabled` for manual control |
| `display/window/stretch/aspect` | `expand` (fill, UI anchors adapt) or `keep` (letterbox) |
| `display/window/stretch/scale_mode` | `integer` for pixel-perfect scaling |

- 4.7: projects created in 4.7 default to `canvas_items` + `expand`. Projects from older versions keep `disabled` + `keep`, because the property default did not change; set both explicitly when upgrading.
- Pixel art: `viewport` stretch, a native base resolution, `scale_mode = integer`, and the project default texture filter set to Nearest (`rendering/textures/canvas_textures/default_texture_filter`).
- Safe areas on mobile: read `DisplayServer.get_display_safe_area()` and pad a root `MarginContainer`. Platform detail lives in `godot-export`.
- Test sizes: run `godot --path . --resolution 1280x720` at the design size, one ultrawide (2560x1080) and one portrait (1080x1920).

## Text

- `Label` for plain text, `RichTextLabel` with `bbcode_enabled` for markup and inline images. `visible_characters` or `visible_ratio` drive typewriter reveals without breaking BBCode.
- 4.7: `RichTextLabel.add_image()`/`update_image()` take float `width`/`height` with `width_unit`/`height_unit` (`IMAGE_UNIT_PIXEL`, `IMAGE_UNIT_PERCENT`, `IMAGE_UNIT_EM`) in place of the `*_in_percent` bools; `UPDATE_WIDTH_IN_PERCENT` was renamed to match.
- Translate with `tr()` and `auto_translate_mode`; see `references/localization.md`.

## HUD

```text
Level (Node2D)
├── World ...
└── HUD (CanvasLayer, layer = 1)        # pause menu and overlays: layer 10+
    └── Root (Control, full rect, mouse_filter = IGNORE)
        ├── HealthBar (ProgressBar, step = 0)
        └── Score (Label)
```

- A `CanvasLayer` draws in screen space, independent of the `Camera2D`/`Camera3D`. HUD nodes outside one move with the camera.
- Drive the HUD from signals (health changed, score changed), not polling in `_process`.

```gdscript
var _bar_tween: Tween

func _on_health_changed(current: int, max_hp: int) -> void:
    health_bar.max_value = max_hp
    if _bar_tween and _bar_tween.is_valid():
        _bar_tween.kill()
    _bar_tween = create_tween()
    _bar_tween.tween_property(health_bar, "value", current, 0.25)

func _on_score_changed(old: int, new: int) -> void:
    create_tween().tween_method(func(v: int): score_label.text = str(v), old, new, 0.4)
```

- `ProgressBar.step = 0` lets a tween animate smoothly instead of snapping to integers.
- World to screen for damage numbers or prompts: `get_viewport().get_canvas_transform() * world_pos` for a 2D point; `Camera3D.unproject_position(pos)` for 3D.
- Interaction prompts: read the bound key from `InputMap.action_get_events(&"interact")` so rebinding updates the text.
- Minimap: a `SubViewport` with its own `Camera2D` (`render_target_update_mode = UPDATE_ALWAYS`) shown through a `TextureRect`, with layers limited by the camera's visibility layers.

## 4.7 additions worth knowing

- `offset_transform_*` (`_position`, `_rotation`, `_scale`, `_pivot`, plus ratio variants): a visual-only transform for shake and pulse that never retriggers container layout. Set `offset_transform_enabled = true` first, or the others do nothing. Tween these for UI juice inside containers.
- `PopupMenu` search bar (`search_bar_enabled`) and `set_item_index()`.
- `GradientTexture2D.FILL_CONIC` for radial cooldown indicators without a shader.
- `Control.accessibility_live` now uses `AccessibilityServer.AccessibilityLiveMode` (enum moved from `DisplayServer`). GDScript keeps working; C# must rebuild.
- `TabContainer.all_tabs_in_front` is deprecated and does nothing.
- `Control.translation_context` (see `references/localization.md`).

## Pitfalls

- UI under a `Node2D` does not theme or take focus.
- Anchors set on a child inside a container are overridden.
- A menu that opens with no focus is dead on a gamepad.
- Hard-coded pixel positions break at other resolutions; use anchors and containers.
