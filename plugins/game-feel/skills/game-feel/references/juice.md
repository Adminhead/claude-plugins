# Juice recipes

Engine-neutral feedback techniques. For the engine's tween, particle and time-scale API in Godot, see the `godot` skill if installed. Code is pseudocode.

## Contents

1. The feedback menu
2. Easing cheat sheet
3. Hit-stop variants
4. Importance tiers
5. Feedback bundles
6. Accessibility settings
7. Review checklist

## 1. The feedback menu

| Channel | Recipe | Notes |
| --- | --- | --- |
| Sound | a short, layered SFX with a little pitch and volume variation | the cheapest high-impact layer; see `game-audio` |
| Flash | tint the sprite or material white for 1 to 3 frames, then fade back | very legible; respect the reduced-flashing setting |
| Hit-stop | time scale near 0 for 40 to 150 ms | section 3 |
| Shake | add trauma to the camera | model in `camera.md` |
| Knockback | an impulse away from the hit normal, clamped, with a 0.1 to 0.2 s control lockout | keep it short; long lockouts feel unfair |
| Squash and stretch | scale to about `(1.3, 0.7)` on land or impact, spring back with overshoot | scale the visual, never the collider |
| Particles | a short burst at the contact point (sparks, dust, debris) | pool them; see `game-performance` |
| Number pop | a damage number that rises, fades and eases out, with random sideways drift | drift stops stacked hits overlapping |
| Anticipation and follow-through | a small wind-up before a big action and a settle after | animation work; makes weight read |
| Zoom punch, vignette, chromatic aberration | brief post-process nudges | large events only, and keep them short |
| Rumble | a short controller vibration scaled to the event | expose an intensity setting |

## 2. Easing cheat sheet

| Goal | Curve | Notes |
| --- | --- | --- |
| Pop in (UI, pickup) | back, ease-out | overshoots the target, then settles |
| Bouncy landing | elastic or bounce, ease-out | cartoonish; use sparingly |
| Settle or decelerate | cubic or quad, ease-out | the default for coming to rest |
| Wind-up | cubic, ease-in | slow start before a fast action |
| Smooth A to B | sine, ease-in-out | camera moves, menu slides |

Durations: pops 0.12 to 0.25 s, settles 0.2 to 0.4 s, menu slides 0.2 to 0.3 s. Snappier is usually better for gameplay feedback.

When a new tween targets a property that is already tweening, kill or replace the old tween first. Two tweens fighting over one property cause jitter and leave the value wrong.

## 3. Hit-stop variants

```text
hit_stop(duration=0.08, scale=0.05):
    if hit_stop_active: extend to max(remaining, duration); return
    time_scale = scale
    after duration of REAL (unscaled) time: time_scale = 1
```

- Restore from an unscaled timer. A scaled timer never fires at scale 0, and the game freezes.
- Overlapping hits extend the current stop rather than stacking new ones.
- Global time scale also slows physics, animation and audio pitch in some engines. If that's wrong for the game, freeze only the attacker and the target (pause their animation and movement) and leave the world running.
- Duration scales with importance: 0.04 s light, 0.06 to 0.1 s medium, 0.12 to 0.15 s heavy.
- Keep input buffering live during the stop so a press during the freeze still fires after it.
- In online games, don't scale global time; freeze visuals locally.

## 4. Importance tiers

Define three presets and assign every event to one. This keeps the game from feeling either dead or exhausting.

| Tier | Trauma | Hit-stop | Particles | Extra | Example events |
| --- | :-: | :-: | :-: | --- | --- |
| small | 0.10 to 0.20 | none | 0 to 4 | tick SFX | footstep, UI hover, coin |
| medium | 0.30 to 0.50 | 0.04 to 0.06 s | 6 to 12 | flash | normal hit, landing, pickup |
| large | 0.70 to 1.00 | 0.10 to 0.15 s | 20 to 40 | flash, zoom, number | crit, boss hit, death, explosion |

## 5. Feedback bundles

One call per event, with the tier choosing the intensity, so the whole game stays proportional and tuning happens in one table:

```text
feedback(event, pos):
    p = TIERS[event.tier]
    play_sfx(event.sound, pitch_jitter=0.05)
    camera.add_trauma(p.trauma * settings.shake_scale)
    if p.hit_stop > 0: hit_stop(p.hit_stop)
    spawn_particles(pos, p.particles)          # from a pool
    if p.flash and not settings.reduce_flashing: flash(event.target, 0.05)
```

Keep the bundle table in data so designers can tune it without code changes.

## 6. Accessibility settings

- Screen-shake scale from 0 to 100%, multiplying trauma output.
- Reduced flashing (photosensitivity): replace white flashes with a static tint or an outline.
- Reduced camera motion: no roll, no zoom punch, gentler follow.
- Rumble intensity, including off.
- Never convey critical information through flashing or shake alone.

## 7. Review checklist

- Every juicy event is assigned a tier, and the tiers read as proportional.
- All feedback returns to rest: scale back to 1, trauma back to 0, time scale back to 1, flash cleared.
- No feedback touches the simulated transform or collider.
- Hit-stop restores from an unscaled timer and doesn't block buffered input.
- The game was played at 30 FPS and uncapped, and feel matches.
- The accessibility settings work and default to sensible values.
