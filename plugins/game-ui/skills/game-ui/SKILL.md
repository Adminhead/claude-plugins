---
name: game-ui
description: Designs and reviews game UI and UX that holds up on every screen and input device, including HUDs, menus, overlays, scaling and safe areas, gamepad focus, settings screens and game accessibility (subtitles, remapping, colour, motion). Use for "HUD", "pause menu", "UI scaling", "gamepad navigation" or "accessibility options" in a game.
---

# Game UI

Engine-neutral architecture for game HUDs and menus: layout, scaling, focus navigation, screen flow, how UI hears about game state, and accessibility. The concrete widget API lives in the engine skill (for Godot, the `godot` skill's `ui-control.md` and `localization.md` references).

Adapted from awesome-gamedev-agent-skills `disciplines/game-ui-ux` (Apache-2.0); see LICENSE and NOTICE.

Not for: web or app UI (`design-core`, `web-design`), visual punch such as button pops, damage numbers and screen shake (`game-feel`), conversation UI (`game-genres`), or art style and icon specs (`game-assets`). Use each one if installed.

## Workflow

1. **Inventory the screens and target devices.** List every screen (title, HUD, pause, settings, inventory, dialogs) and every target: resolutions, aspect ratios (16:9, 16:10, 21:9, phone portrait or landscape), TV at couch distance, touch, mouse, gamepad. Done when each screen has a target device list.
2. **Lay out with anchors and containers, never absolute pixels.** Anchor each element to an edge, corner or centre, and let rows, columns and grids flow children. A hard-coded `(x, y)` breaks at the first new resolution.
3. **Pick one scaling policy for the whole UI.** Design at a reference resolution that scales to fit, then decide what extra width or height does: expand (show more, push HUD corners outward) or letterbox (keep the frame). Pixel art needs integer scaling with nearest filtering. Done when the policy is written down and the engine setting matches it.
4. **Inset critical UI to the safe area.** Health, timers and prompts stay inside the OS-reported safe rect (notches, rounded corners, TV overscan). Decorative art may bleed to the edge. Re-apply on resize and orientation change, not once at startup.
5. **Make every screen work on the gameplay input device.** Focus one control when a screen opens, define neighbours so a d-pad walks the layout predictably, show a focus style distinct from hover, trap focus inside modals, and restore the previous focus on close. Mouse and gamepad coexist: moving the mouse never strands the gamepad user.
6. **Model screens as a stack.** Push an overlay (pause over game, settings over pause, confirm over settings) and pop on "back". Only the top screen takes input. Pausing the game must not pause the pause menu.
7. **Drive the HUD from events.** The HUD subscribes to `health_changed`, `score_changed` and similar signals and updates when they fire. It never polls game state every frame.
8. **Build accessibility in from the first screen.** Work through [references/accessibility.md](references/accessibility.md): text size and contrast, no information by colour or sound alone, subtitles, remapping, hold and mash alternatives, motion and flash options, and settings that persist. Done when the Basic checklist there passes.
9. **Verify on real targets.** Resize the window through every target ratio, play with the mouse unplugged, test at couch distance or on the smallest phone, and switch to the longest translation. Report what you saw at which resolutions, not what the editor preview suggested.

## Patterns

Engine-neutral pseudocode. Map each to the engine skill's API.

```text
# Event-driven HUD: update only on change
on ready:            player.health_changed.connect(on_health_changed)
on_health_changed(current, max): health_bar.value = current / max
# Wrong: every frame, health_bar.value = player.hp / player.max_hp

# Screen stack
push(screen): top.input_enabled = false; stack.append(screen); show(screen); screen.focus_default()
pop():        hide(stack.pop()); top.input_enabled = true; top.restore_focus()
# Pause overlay: pause the game tree, but set the overlay to keep processing while paused.

# Safe-area anchors from the OS safe rect (pixels -> normalised)
anchor_min = (safe.x / screen_w, safe.y / screen_h)
anchor_max = ((safe.x + safe.w) / screen_w, (safe.y + safe.h) / screen_h)
```

## Gotchas

- **No initial focus means a dead menu on a controller.** The player lands on a screen with nothing selected and no input does anything. Every screen open and every modal close sets focus.
- **A 16:9-only layout** crops on ultrawide and phones. Decide expand or letterbox up front, then anchor HUD corners outward.
- **Polling game state in a per-frame callback** couples UI to gameplay internals and does work when nothing changed. Use signals or events.
- **Menu flow as booleans** (`is_paused`, `in_settings`, `in_confirm`) turns into contradictory states. A stack has one top.
- **Fixed-width buttons sized to English** clip German (often around 30% longer) and other long locales. Externalise every string, let containers size to content, leave room for right-to-left mirroring and font coverage, and keep icons separate from text. The engine's translation API goes to the engine skill (Godot: `godot/references/localization.md`).
- **Small text** is the most common UI complaint. The Game Accessibility Guidelines suggest at least 28 px body text and 46 px subtitles at 1080p; scale with the UI and add a text-size option.
- **State shown only by colour** (red enemy, green ally) fails for colour-blind players. Add an icon, shape, pattern or label.
- **Diegetic UI** (ammo on the gun, health on the suit) can hurt readability. Use it for flavour on key elements and keep a non-diegetic fallback for anything critical.
- **World-space markers** (floating health bars, objective pins) need clamping to the screen edge when off-screen and scaling with distance in 3D.

## References

- [references/layout-and-flow.md](references/layout-and-flow.md): read when setting up scaling modes, safe-area handling, the full focus-navigation rules, the screen stack, diegetic and world-space UI, or localization-ready layout.
- [references/accessibility.md](references/accessibility.md): read when designing a settings or accessibility menu, subtitles, remapping, difficulty and assist options, or reviewing a build for accessibility. Paraphrased from the Game Accessibility Guidelines with links to each guideline.

## Related skills

- `godot` (Control nodes, themes, stretch settings, translation): the engine side of this skill in Godot projects.
- `game-feel`: transitions and HUD juice that sit on top of this layout.
- `game-playtest`: recruiting testers with disabilities and checking the UI in a real session.
