---
name: game-feel
description: Tunes how a game feels to control, in any engine. Covers input buffering, coyote time, variable jump height, stick deadzones, rebinding, camera follow, look-ahead and shake, hit-stop, tweens, squash and stretch, knockback and jitter. Use for "feels floaty", "add juice", "the camera jitters", "controls feel laggy" or "add screen shake".
---

# Game feel

Game feel is how an action reads to the player: how quickly it responds, how forgiving it is, how much weight it seems to have and how the camera frames it. This skill covers engine-neutral technique and the numbers to start tuning from. It adds feel on top of a working mechanic and does not implement the mechanic.

Not for: engine API such as nodes, tweens, InputMap or physics bodies (for Godot, use the `godot` skill and `godot-physics` if installed); code structure and the fixed-timestep loop (`game-architecture`); frame-rate problems (`game-performance`); menus and HUD (`game-ui`); sound mixing (`game-audio`).

## Workflow

1. **Name the complaint as a symptom.** "Floaty" usually means low gravity or a slow fall. "Laggy" means input latency, a missing buffer or heavy smoothing. "Unfair" means no coyote time or a hitbox larger than the sprite. "Jittery" means the render rate and the simulation rate are out of step. "Weak" means feedback is missing. Fix that cause before adding juice.
2. **Find the event hooks.** Feel attaches to discrete events (`jumped`, `landed`, `hit`, `picked_up`, `died`). If the mechanic doesn't emit them, add them first.
3. **Make every tunable a named value, in seconds or units per second, never frames.** Expose the values so they can be changed while the game runs. Feel is tuned by playing, not by reading code.
4. **Change one value at a time and play.** Try it at a low and a high frame rate (cap the game at 30, then uncap it). Anything that changes between the two is frame-rate dependent and wrong.
5. **Keep feedback off the simulation.** Shake moves the camera's offset, not the body. Squash scales the sprite, not the collider. Hit-stop scales time and never stalls game logic.
6. **Report what you observed** after playing: whether the shake decays, whether input still registers during hit-stop, and whether the camera holds steady at both frame rates. If you could not run the game, say so and list what to check.

## Controls (read `references/input.md` for the detail)

- Gameplay reads named actions (`jump`, `move`), never raw keys. Bindings are data, which is what makes rebinding, gamepad support and prompts possible.
- Use the edge (pressed this tick) for discrete actions and the held state for continuous ones. A held check on jump fires it again every frame.
- **Input buffer:** remember an early press for 100 to 150 ms and fire it as soon as it becomes valid (a jump before landing, an attack during recovery).
- **Coyote time:** allow a ground jump for 80 to 120 ms after the player leaves a ledge.
- Consume the buffer and the coyote timer when the jump fires, so one press gives one jump.
- **Variable jump height:** if the button is released while the player is still rising, cut upward velocity (for example multiply it by 0.5) or raise gravity. A tap gives a hop and a hold gives a full jump.
- **Fall faster than you rise:** apply 1.5 to 3 times gravity while falling, and clamp to a terminal velocity. Floaty jumps usually come from symmetric gravity.
- **Design jumps from height and time:** with peak height `h` and time to apex `t`, gravity is `g = 2h / t²` and launch speed is `v0 = 2h / t`. Designers can then tune "3 tiles high, 0.35 s up" directly.
- Use a radial deadzone on sticks, rescaled from the edge of the deadzone, never a per-axis clip, which snaps diagonals to the axes.
- Check whether the engine's just-pressed query is tick-aware before adding a manual latch. Some engines already latch presses for the physics step; the engine skill says which.

## Camera (read `references/camera.md` for rigs and the shake model)

- Smooth with `t = 1 - exp(-rate * dt)`, then `pos = lerp(pos, target, t)`, with a rate of 5 (floaty) to 12 (snappy). A plain `lerp(pos, target, 0.1)` or `lerp(pos, target, k * dt)` changes feel with frame rate.
- Deadzone: move the camera focus only by how far the target has left the zone.
- Look-ahead: offset toward velocity or facing by 40 to 120 px, and ease the offset itself so a direction flip doesn't whip the view.
- Clamp the visible rectangle to the level bounds, not the camera centre. On an axis where the level is smaller than the view, centre on that axis.
- Update the camera after movement and physics. With physics interpolation, follow the target's interpolated transform.
- Add shake last, as an additive offset on top of follow. Drive it with decaying trauma (`shake = trauma²`) and smooth noise, never a fresh random value each frame.
- On a teleport, respawn or cut, reset smoothing so the camera doesn't sweep across the map.

## Juice (read `references/juice.md` for recipes and tier presets)

- One satisfying hit is 5 to 8 small responses inside about 100 ms: sound, particles, flash, hit-stop, knockback, shake and a number pop. Start with 2 or 3 and add until it reads.
- Exaggerate briefly, then return to rest. Juice that never settles becomes the new normal.
- Scale everything by importance. Define small, medium and large presets and assign each event to one. A footstep is not a boss death.
- Ease motion: overshoot (back or elastic) for a pop, ease-out for settling. Linear motion looks mechanical.
- **Hit-stop:** drop time scale to near 0 for 40 to 150 ms, then restore it from a timer that ignores time scale. A scaled timer never fires at scale 0.
- Squash and stretch roughly preserve area: `(1.3, 0.7)` on land, then spring back.
- Knockback: a short, clamped impulse away from the hit, with a brief control lockout of about 0.1 to 0.2 s.

## Jitter and physics feel

- Simulate on the fixed step and draw interpolated transforms. Visible stutter at a steady frame rate usually means the render rate and the physics rate are drifting against each other with no interpolation. Enable the engine's physics interpolation before hand-rolling it.
- A camera following a body that moves on the physics tick, while the camera itself updates every frame, jitters. Either interpolate the body or follow its interpolated position.
- Mass does not change fall speed. Shape feel with gravity scale and drag.
- Small, fast bodies that pass through thin walls need continuous collision detection or a speed cap: `speed / physics_hz` must stay below the thinnest wall.
- After a teleport, reset interpolation so the body doesn't smear across the screen.

## Gotchas

- Do not multiply mouse delta by `dt`. It is already a distance for this frame, so scaling it makes look speed depend on frame rate. Stick look is a rate and does take `dt`.
- Do not smooth first-person mouse look. Players feel the smoothing as input lag.
- A 2D camera node may ignore rotation by default, which silently disables shake roll. Check the engine skill and enable rotation, or drop the roll.
- Hit-stop on every frame of a held or multi-hit attack locks the game. Trigger it once per impact and cap the total per second.
- Buffered input must still pass through during hit-stop and short animations. Feedback that blocks input reads as lag.
- Ship accessibility toggles: a screen-shake scale (0 to 100%), reduced flashing and reduced camera motion. Full remapping and hold-or-toggle options belong with them.

## References

- `references/input.md`: action layers, edge versus held, buffering and coyote tuning, jump feel maths, deadzone curves, rebinding with conflicts, device prompts, touch and an input accessibility checklist.
- `references/camera.md`: smoothing maths, a full 2D rig (deadzone, look-ahead, bounds), the trauma shake model, 3D orbit and collision, first-person look, group framing and cuts.
- `references/juice.md`: the feedback menu, easing cheat sheet, hit-stop variants, importance tiers, and accessibility settings.

## Related skills

- `godot`, `godot-physics`: the Godot API for cameras, tweens, InputMap and character controllers, if installed.
- `game-architecture`: the fixed-timestep loop and the state machines that controllers use.
- `level-design`: player metrics depend on the jump and run values tuned here.
- `game-playtest`: confirm the feel with real players.
