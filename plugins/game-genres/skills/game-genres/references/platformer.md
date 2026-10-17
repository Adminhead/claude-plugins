# Platformer

Core loop: see a gap or hazard, commit to a jump, land safely or die, reach the next checkpoint. The same jump repeats thousands of times, so the controller is the game. Tighten it before building any levels.

## Core systems (build in this order)

1. **Run and jump controller** with acceleration, deceleration, gravity and the feel aids below.
2. **Collision:** solid ground and walls, one-way (jump-through) platforms.
3. **Level geometry:** tilemap or hand-placed colliders, merged into large shapes.
4. **Hazards, death and instant respawn** at the last checkpoint.
5. **Checkpoints and a goal** (flag, door, exit).
6. **Camera** with deadzone, look-ahead and level-bounds clamp.
7. **Juice:** landing dust, squash and stretch, sound (`game-feel`).

## Data model

- Controller tuning as one data block, in feel units: `jump_height_tiles`, `time_to_apex`, `fall_multiplier`, `coyote_time`, `jump_buffer`, `jump_cut`, `ground_accel_time`, `air_control`, `max_fall_speed`. Derive physics values from it at load.
- Level: tile layers (solid, one-way, hazard), plus entity markers (spawn, checkpoints, moving platforms with paths, goal).
- Run state: current checkpoint id, collectibles taken, death count, timer.

## Feel targets

Derive gravity and jump velocity from height and time instead of guessing (y axis down):

```text
gravity       = 2 * jump_height / time_to_apex^2
jump_velocity = -2 * jump_height / time_to_apex
fall_gravity  = gravity * fall_multiplier
```

| Knob | Starting point | Notes |
| --- | --- | --- |
| Jump height | 3 to 4 tiles | below the height players fear committing to |
| Time to apex | 0.30 to 0.40 s | lower is snappier |
| Fall gravity | 1.5 to 2.0 times rise gravity | the biggest single fix for "floaty" |
| Coyote time | 0.08 to 0.12 s (5 to 7 frames at 60 Hz) | jump just after leaving a ledge |
| Jump buffer | 0.10 to 0.15 s | press just before landing still jumps |
| Variable jump cut | multiply upward velocity by 0.4 to 0.5 on release | only while rising |
| Apex hang | halve gravity while vertical speed is near zero | extra air control at the top |
| Ground acceleration | top speed in 0.05 to 0.10 s | longer gives momentum, ice feel |
| Air control | 0.5 to 1.0 times ground | below 1 gives committed arcs |
| Corner correction | nudge up to 4 px sideways | when a rising jump clips a ceiling corner |
| Max fall speed | clamp | prevents tunneling and runaway speed |

Jump logic per physics step:

```text
if on_floor: coyote = COYOTE_TIME
if jump_pressed: buffer = JUMP_BUFFER
coyote -= dt; buffer -= dt
if buffer > 0 and coyote > 0: vel.y = jump_velocity; buffer = 0; coyote = 0   # consume both
if jump_released and vel.y < 0: vel.y *= JUMP_CUT
vel.y += (fall_gravity if vel.y > 0 else gravity) * dt
vel.y = min(vel.y, MAX_FALL)
```

Other expected behaviors:

- **Corner correction:** when rising into a ceiling and only the outer 1 to 4 px are blocked, shift sideways into free space and keep the upward velocity. The same trick at ledge edges makes landings generous.
- **One-way platforms:** use the engine's one-way collision flag. Drop-through on Down + Jump disables that collision for 0.1 to 0.2 s or until the player's top is below the platform.
- **Moving platforms:** carry the player by the platform's per-frame delta; on jump-off add the platform's velocity, capped so it can't fling the player.
- **Camera:** deadzone rectangle, look-ahead in the facing direction (lerped), smoothing with `1 - exp(-k * dt)` so it's frame-rate independent, clamp to level bounds, and slow or lock vertical follow during normal hops.

## Balancing norms

- Teach one mechanic in isolation, let the player practice it safely, then combine it with a known one. Never introduce two new things in one hazard.
- Place the first instance of any lethal hazard where failure is cheap (next to a checkpoint).
- Short checkpoint segments early, longer later. Respawn must be instant (under about half a second).
- Difficulty comes from layout (gap width, timing windows, hazard combinations), not from loosening or tightening the controller per level.
- Optional collectibles on harder side paths let skilled players opt into difficulty.

## Pitfalls

- Velocity or timers not scaled by delta time: speed changes with frame rate.
- Symmetric gravity: floaty jumps. Make the fall heavier.
- No jump buffer ("the jump didn't register") or no coyote time ("I fell off and couldn't jump").
- Per-tile colliders: the player catches on seams between tiles. Merge collision shapes and use a single capsule or box for the player.
- Tunneling at high fall speed: clamp fall speed, use continuous collision for fast bodies.
- Camera that snaps or bobs on every jump.
- Long re-traversal after death: players quit.

## Engine pointers

- Character controller, floor detection, one-way collision: `godot-physics` (Godot); the engine's controller docs elsewhere.
- Tilemaps, camera nodes: `godot` (2D and camera references).
- Shake, hit-stop, squash and stretch: `game-feel`.
- Layout, pacing and teaching order: `level-design`.
