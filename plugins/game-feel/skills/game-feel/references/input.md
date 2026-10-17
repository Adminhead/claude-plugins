# Input feel

Engine-neutral. Code is pseudocode; for the engine's input API (Godot's InputMap and `Input`), see the engine skill if installed.

## Contents

1. Actions, not keys
2. Edge versus held, and where to read input
3. Buffering and coyote time
4. Jump feel
5. Analog sticks
6. Rebinding
7. Devices and prompts
8. Touch
9. Accessibility checklist

## 1. Actions, not keys

Map physical inputs (key, button, touch zone) to named actions (`jump`, `interact`, `move_x`). Gameplay reads actions only, and bindings are data. One indirection gives rebinding, multi-device support, prompt swapping and accessibility.

```text
# RIGHT
if action_just_pressed("jump"): try_jump()
move = action_axis("move_left", "move_right")      # -1..1

# WRONG: unrebindable, keyboard-only, and a held check re-fires every frame
if key_down(SPACE): try_jump()
```

Group actions into contexts (gameplay, menu, vehicle) and switch the active context, rather than checking "is the menu open" in every handler.

## 2. Edge versus held, and where to read input

- Discrete actions (jump, interact, fire one shot) read the edge: pressed this tick.
- Continuous actions (move, aim, hold to charge) read the held state or axis every tick.
- Read held state in the fixed step, so movement agrees with the simulation.
- A press that lands between two fixed ticks must not be lost. Some engines' just-pressed queries are already tick-aware; others need a flag latched on the input event and cleared when the fixed step consumes it. Check the engine skill before adding a latch.
- One-shot UI or gameplay commands belong in an event callback that the UI can consume first, so clicking a button doesn't also fire a weapon.

## 3. Buffering and coyote time

| Window | Typical | Purpose |
| --- | --- | --- |
| Input buffer | 100 to 150 ms (6 to 9 frames at 60 Hz) | an early press still fires when the action becomes valid |
| Coyote time | 80 to 120 ms | a jump just after leaving a ledge still counts as grounded |
| Attack or dash buffer | 100 to 200 ms | chain actions through recovery frames |

```text
BUFFER = 0.12; COYOTE = 0.10
buffer_t -= dt
coyote_t = COYOTE if on_floor else coyote_t - dt
if action_just_pressed("jump"): buffer_t = BUFFER
if buffer_t > 0 and coyote_t > 0:
    vel.y = JUMP_SPEED
    buffer_t = 0; coyote_t = 0          # consume both: one press, one jump
```

- Express windows in seconds, never frames.
- Consume on use. A lingering buffer causes a double jump on landing.
- Clear coyote time when the jump fires, or the player gets a second jump in the air.
- Too long feels mushy and causes unintended actions; too short feels punishing. Tune by playtest.

## 4. Jump feel

- **From design numbers:** peak height `h`, time to apex `t`: `g = 2h / t²`, `v0 = 2h / t`. Change either number and both values follow.
- **Variable height:** on release while rising, multiply upward velocity by about 0.4 to 0.6, or switch to a higher "released" gravity. Read the edge for the jump and the held state for the cut.
- **Fall gravity:** 1.5 to 3 times rising gravity, then clamp to terminal velocity.
- **Apex hang:** halve gravity while `abs(vel.y)` is below a small threshold near the peak. This gives air control and reads as responsive.
- **Air control:** usually lower acceleration than on the ground, but not zero. Zero air control feels like a cannonball.
- **Corner correction:** if the head clips a ceiling corner by a few pixels, nudge the player sideways instead of killing the jump. Do the same for ledge edges on landing.
- **Acceleration and friction:** a short ramp up (0.05 to 0.15 s to top speed) and a shorter stop feel tight. Instant top speed feels robotic; a long ramp feels icy.

## 5. Analog sticks

```text
apply_deadzone(stick, inner=0.2, outer=0.95, curve=1.5):
    m = length(stick)
    if m < inner: return ZERO
    s = clamp((m - inner) / (outer - inner), 0, 1)   # rescale: 0 at inner edge, 1 at outer
    return normalize(stick) * pow(s, curve)           # curve > 1 = finer control near centre
```

- Radial, not per axis. A per-axis clip carves a square hole and snaps diagonals to the axes.
- The outer deadzone lets worn sticks reach full magnitude.
- Triggers get their own small deadzone.
- 8-way movement from a stick: snap the angle after the deadzone, not before.
- Turn rate from a stick is a rate (multiply by `dt`). Mouse delta is a distance (do not multiply).

## 6. Rebinding

Flow:

1. Enter capture mode for one action and show "press a key", with a timeout and Escape to cancel.
2. Ignore the input that opened capture mode, plus mouse motion and stick noise below the deadzone.
3. Check for conflicts within the same context. Offer to swap or to clear the other binding rather than refusing silently.
4. Apply the binding: erase the old event for that device and add the new one.
5. Save the bindings (settings storage, not the save game), and load them before the first frame of gameplay.
6. Offer "reset to defaults" for each action and for all.

Never allow the binding that opens the menu or confirms in menus to be removed without a fallback. A player who unbinds Escape on keyboard with no gamepad is stuck.

## 7. Devices and prompts

- Track the last device that sent meaningful input (above the deadzone), and switch prompts and glyphs when it changes, mid-session, without a restart.
- Map gamepad buttons to abstract positions (south, east, west, north) and pick the glyph set per controller family. Face-button labels differ between makers.
- Per-player device assignment in local multiplayer: assign on first press and keep it until the player leaves.

## 8. Touch

- Route on-screen controls through the same action layer as physical input.
- A virtual stick uses a floating origin (where the thumb lands) and the same radial deadzone.
- Make hit areas larger than the drawn button, avoid multi-touch chords for essential actions, and keep controls clear of the screen's safe-area insets.

## 9. Accessibility checklist

- Full remapping for every action on every device, with conflict handling and a reset.
- Toggle or hold for actions that default to hold (aim, sprint, crouch).
- No required simultaneous presses for essential actions.
- Adjustable sensitivity and deadzones, and independent X and Y inversion.
- Adjustable timing windows where possible (longer buffer and coyote time, slower quick-time events), and "hold instead of mash".
- No artificial input delay. Perceived latency harms both feel and accessibility.
