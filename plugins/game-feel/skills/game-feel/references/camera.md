# Camera feel

Engine-neutral technique. For camera nodes, limits, smoothing properties and spring arms in Godot, see the `godot` skill (its camera reference) if installed. Code is pseudocode.

## Contents

1. Frame-rate-independent smoothing
2. The 2D rig: deadzone, look-ahead, smoothing, bounds
3. Screen shake: the trauma model
4. 3D third-person orbit
5. First-person look
6. Group framing and split screen
7. Cuts, teleports and blends
8. Prefer the engine's camera first

## 1. Frame-rate-independent smoothing

`pos = lerp(pos, target, k)` applies `k` per frame, so it smooths more per second at 144 FPS than at 30. `lerp(pos, target, k * dt)` is closer but still drifts with frame rate and overshoots when `k * dt > 1` on a slow frame. Fix the rate per second instead:

```text
t   = 1 - exp(-rate * dt)      # rate ~5 floaty .. 12 snappy
pos = lerp(pos, target, t)     # same convergence at any frame rate
```

The same formula works for any smoothed value: zoom, look-ahead offset, angles (lerp the shortest angle difference). A critically damped spring (`smooth_damp(pos, target, velocity, smooth_time)`) is also frame-rate independent and keeps velocity continuous, so it does not snap when the target changes direction.

## 2. The 2D rig

Each frame, after the target has moved:

1. **Deadzone.** Move the focus only by the overflow beyond the zone, per axis for a box or radially for a circle. A box feels different from a circle; pick one on purpose.
2. **Look-ahead.** Desired offset = direction of motion (or facing) times the look-ahead distance. Ignore movement below a small threshold so the camera doesn't drift while the player idles. Ease the offset itself with the smoothing formula, so turning around doesn't whip the view.
3. **Smooth** the camera toward `focus + look_ahead`.
4. **Clamp the view, not the centre:** clamp the centre to `[min + half_view, max - half_view]` per axis, where `half_view = viewport_size / 2 / zoom`. If the level is smaller than the view on an axis, centre on that axis.
5. **Add shake** as an offset (section 3).

```text
to = target_pos - focus
focus.x += max(abs(to.x) - dz.x, 0) * sign(to.x)
focus.y += max(abs(to.y) - dz.y, 0) * sign(to.y)

move = target_pos - prev_target_pos
want_ahead = normalize(move) * LOOK_AHEAD if length(move) > EPS else ZERO
ahead = lerp(ahead, want_ahead, 1 - exp(-AHEAD_RATE * dt))

cam = lerp(cam, focus + ahead, 1 - exp(-RATE * dt))
cam = clamp_view(cam)
draw_at(cam + shake_offset)
```

Starting values: deadzone 32 to 64 px, look-ahead 40 to 120 px eased over 0.2 to 0.4 s, smoothing rate 6 to 10.

Platformer specifics: look ahead more horizontally than vertically. Lock vertical follow while airborne and re-centre on landing (platform snapping), so every jump doesn't bob the screen. Let the player look down on a long fall.

Room-based games: switch bounds per room and ease between them (a short tween of the limits) instead of snapping.

## 3. Screen shake: the trauma model

Keep one `trauma` value in `[0, 1]`. Events add to it, it decays linearly, and the shake amount is `trauma²` (or `trauma³`). Small hits barely move the screen, big hits punch, and the shake always ends by itself.

```text
add_trauma(a): trauma = min(trauma + a, 1)      # hits add; they never reset

each frame:
    trauma = max(trauma - DECAY * dt, 0)        # DECAY ~1.0..1.5 per second
    s = trauma * trauma
    time += dt * NOISE_SPEED
    offset.x = MAX_OFFSET.x * s * noise(seed_x, time)   # smooth noise in -1..1
    offset.y = MAX_OFFSET.y * s * noise(seed_y, time)
    roll     = MAX_ROLL     * s * noise(seed_r, time)
```

- Use smooth noise (simplex, or summed sines at unrelated rates such as `0.6 sin(11t) + 0.4 sin(23t)`), with a different seed or offset per axis. A fresh random value each frame buzzes like static.
- Starting values: offset 8 to 16 px horizontally and 6 to 10 px vertically, roll 0.05 to 0.12 rad (about 3 to 7 degrees), per-hit trauma 0.15 (light) to 0.8 (heavy).
- Apply shake to the camera's offset, never to the follow target or the player. If shake feeds the follow target, follow fights shake.
- A 2D camera that ignores rotation by default drops the roll silently. Enable rotation on the camera, or leave roll out.
- Scale the output by the player's screen-shake setting (0 to 100%, with a default around 60 to 80%).
- Directional kick: for a gunshot or a hit from one side, add a short offset impulse along the hit direction that eases back, on top of the noise.

## 4. 3D third-person orbit

- **Rig:** a pivot at shoulder or head height. Yaw on the pivot, pitch on a child, and the camera at `-arm_length` on the local back axis.
- **Collision:** cast from the pivot toward the desired camera position (a sphere cast is better than a ray) and place the camera at the first hit, minus a small margin. Pull in fast and ease back out slowly, or the camera pumps as the player walks past pillars.
- **Pitch clamp:** about -80 to +45 degrees, so the camera never flips over the top or buries itself in the floor.
- **Recentre:** after a few seconds without camera input, ease yaw toward the movement direction (optional, and off in many action games).
- **Occlusion of the player:** fade or dither geometry between the camera and the player instead of pulling the camera in for thin objects.
- **Expose** sensitivity and independent X and Y inversion.

## 5. First-person look

- Yaw rotates the body, so movement aligns with the view. Pitch rotates only the head or camera.
- Clamp pitch to about ±85 to 89 degrees, and never let roll build up.
- Mouse: relative motion with the cursor captured, applied straight to yaw and pitch. No `dt` and no smoothing.
- Stick: deadzone, response curve, then `turn_rate * dt`. Add slight acceleration for large turns.
- FOV: expose it. Narrow FOVs cause motion sickness for some players.

## 6. Group framing and split screen

- Frame the bounding box of all targets, plus padding.
- 2D: set zoom so the box fits, clamped between minimum and maximum zoom, and smooth the zoom.
- 3D: dolly back or widen the FOV to fit the box.
- Split screen: one camera per player, each drawing to its own viewport rectangle. Recompute rectangles on window resize, keep one audio listener (or mix per player deliberately), and budget the extra render cost.

## 7. Cuts, teleports and blends

- On a respawn, teleport or room change, either cut on purpose and reset all smoothing state (focus, look-ahead, velocity, trauma), or move quickly with an ease. Never let a large smoothing distance sweep the camera across the level.
- Blend between gameplay and cutscene cameras with an ease-in-out over 0.3 to 1 s.
- Hide hard cuts behind a fade or a frame of black when the two views are unrelated.

## 8. Prefer the engine's camera first

Most engines ship smoothing, limits, drag margins and spring arms, and some have camera addons with priority-based switching. Use those, then hand-roll only what they lack (usually look-ahead easing, trauma shake, platform snapping). Check the engine skill for the property names. Some built-in smoothing is frame-rate independent and some is not.
