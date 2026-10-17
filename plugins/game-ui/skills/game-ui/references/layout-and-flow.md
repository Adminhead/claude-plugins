# Layout, scaling and flow

Depth for the `game-ui` workflow. Engine-neutral; the engine skill owns the exact setting names (Godot: `godot/references/ui-control.md`).

## Contents

1. Scaling modes
2. Safe-area handling
3. Focus navigation
4. Screen stack
5. Diegetic, non-diegetic and world-space UI
6. Localization-ready layout
7. Test matrix

## 1. Scaling modes

Every engine offers the same three choices under different names:

| Mode | What scales | Use for |
|---|---|---|
| Scale UI to window (canvas or "scale with screen size") | UI and 2D drawn at full resolution, scaled from a reference size | Most games |
| Scale a fixed-resolution viewport | The whole frame renders at the reference size, then scales | Pixel art (with integer scaling and nearest filtering) |
| No scaling | Nothing; UI stays at native pixels | Tools and editors, rarely games |

Then pick the aspect policy:

| Policy | Effect | Pair with |
|---|---|---|
| Expand | Extra width or height becomes visible space | HUD anchored to corners so it moves outward |
| Keep (letterbox or pillarbox) | Fixed frame with bars | Hard-framed designs, fixed-screen puzzles |
| Keep width or keep height | One axis fixed, the other expands | Side-scrollers (keep height), vertical shooters (keep width) |

When the engine blends width and height matching (for example a 0 to 1 match slider), use 0.5 by default, 1.0 when vertical layout must never clip, 0.0 when horizontal must never clip.

## 2. Safe-area handling

- The OS reports a safe rectangle that excludes notches, rounded corners and, on some TVs, overscan.
- Inset only critical UI: health, timers, prompts, buttons. Backgrounds and decorative frames can bleed.
- Convert the pixel rect to normalised anchors (see the SKILL.md pattern) or to container margins.
- Re-apply on window resize and orientation change. Cache the last applied rect so you don't redo it every frame.
- On consoles, follow the platform's title-safe guidance and offer a "UI margin" or "screen area" setting.

## 3. Focus navigation

Requirements for a controller- and keyboard-usable UI:

1. **Initial focus** on every screen open.
2. **Explicit neighbours** where automatic navigation guesses wrong (grids with gaps, diagonal layouts, tabs).
3. **Visible focus style** distinct from hover, and not colour alone (outline, scale, marker).
4. **Deliberate edges:** wrap or stop at list ends on purpose; trap focus inside modal dialogs.
5. **Restore focus** to the control that opened a modal when it closes; check it still exists first.
6. **Coexistence:** mouse movement may move the selection, a gamepad press acts on the focused control, and moving the mouse never clears focus.
7. **Button prompts** match the last-used device (keyboard glyphs vs gamepad glyphs) and update when the device changes.
8. **Tabs and pages** take shoulder buttons; "back" is always the same button and always pops one level.

## 4. Screen stack

```text
stack = []
push(screen):
    if stack: stack.top.input_enabled = false; stack.top.remember_focus()
    stack.append(screen); show(screen); screen.focus_default()
pop():
    hide_and_free(stack.pop())
    if stack: stack.top.input_enabled = true; stack.top.restore_focus()
replace(screen): pop(); push(screen)        # title -> game, not an overlay
```

- Pause is a push. The game world pauses; the pause screen keeps processing.
- Confirm dialogs are a push with focus trapped and "back" meaning cancel.
- Scene changes clear the stack or replace its root; never leave an orphan overlay holding input.

## 5. Diegetic, non-diegetic and world-space UI

| Kind | Example | Trade-off |
|---|---|---|
| Non-diegetic | Classic HUD on the screen plane | Clearest and cheapest |
| Diegetic | Ammo counter on the weapon model, health on the suit | Immersive; can hurt readability; keep a fallback for critical info |
| World-space (spatial) | Floating health bars, damage numbers, objective pins | Anchor to a world point, project to screen, clamp to the edge when off-screen, scale or fade with distance |
| Meta | Screen-edge blood or vignette for low health | Pair with a non-visual or non-colour cue for accessibility |

## 6. Localization-ready layout

- Externalise every displayed string behind a key; never build sentences by concatenating fragments, because word order differs by language. Use format strings with named arguments and plural rules.
- Let containers size to content. Budget for long locales (German and Finnish often run around 30% longer than English; short English labels can double).
- Plan right-to-left mirroring (Arabic, Hebrew): layout direction, icon flipping where meaningful, number and date formatting by locale.
- Check font coverage for every target script (CJK, Cyrillic, Arabic) and fallback fonts.
- Keep text out of textures so only strings need translating.
- Test with a pseudo-locale that lengthens strings and adds accents.

## 7. Test matrix

Run at least: the design resolution, one ultrawide (21:9), one portrait or tall phone, and the smallest supported window. For each, confirm anchoring, safe-area insets, text legibility at the target viewing distance, full gamepad-only navigation, and the longest translation.
