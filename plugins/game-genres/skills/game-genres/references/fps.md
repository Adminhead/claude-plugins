# FPS

Core loop: scan, acquire a target, aim and fire, confirm the hit or kill, then reposition, reload or advance. Everything rests on the aim-and-fire micro-loop feeling crisp: responsive look, clear hit feedback, deaths that read instantly.

## Core systems (build in this order)

1. **First-person controller:** move plus mouse or stick look, gravity, jump, crouch.
2. **Camera:** eye height, configurable FOV and sensitivity, recoil kick.
3. **Shooting model:** hitscan and/or projectiles, one shared impact path for feedback.
4. **Weapons and ammo:** damage, fire rate, magazine, reload, switching.
5. **Health and damage:** HP, headshot multiplier, death. Player and enemies share it.
6. **Feedback:** hitmarkers, impact decals and particles, hit sounds, kill confirm.
7. **Enemy AI:** perceive, alert, attack, search (`game-ai`).
8. **Objectives** beyond shooting: clear, capture, survive, escort.

## Data model

```text
weapon = { id, mode: hitscan | projectile, damage, fire_rate, mag_size, reload_time,
           falloff: { near: 20, far: 60, min_mult: 0.4 }, headshot_mult: 2.0,
           spread: { base, per_shot, max, recover }, recoil_pattern: [pitch, yaw ...],
           projectile: { speed, gravity, splash_radius }? }
damageable = { hp, max_hp, armor?, hitboxes: { head: 2.0, body: 1.0, limb: 0.75 } }
```

## Shooting

```text
hitscan: dir = apply_spread(camera.forward, spread)
         hit = raycast(camera.origin, dir, range, mask = SHOOTABLE)
         if hit: dmg = damage * falloff(hit.distance) * hitbox_mult(hit.part)
                 hit.target.take_damage(dmg); impact_fx(hit.point, hit.normal)
projectile: spawn at the muzzle, velocity along the aim ray, lifetime = range / speed,
            damage and splash on its own collision
```

| | Hitscan | Projectile |
| --- | --- | --- |
| Skill | flick and track | lead, predict, arc |
| Feel | crisp, precise | readable, dodgeable |
| Cost | one ray per shot | a moving body and collision |
| Range limit | damage falloff | speed and lifetime |

- Cast hitscan from the camera, not the muzzle, so shots go where the crosshair points; draw tracers from the muzzle to the hit point.
- Fast projectiles need continuous collision or a ray from last to current position each step, or they tunnel through thin walls.
- Spread: random offset in a cone that grows per shot and while moving, and recovers when still. Keep the first shot accurate.
- Recoil: a fixed, learnable pattern applied to the camera, recovering toward the original aim. Pure random recoil feels uncontrollable.

## Feel targets

- Look uses the raw mouse delta times sensitivity, never multiplied by delta time; movement integration does use delta time.
- Every shot gives sound and muzzle flash on the same frame as the input. Every hit gives a hitmarker and a hit sound; kills get a distinct confirm.
- Expose FOV (PC players commonly expect 80 to 100 degrees horizontal) and sensitivity in options; also mouse invert and controller aim assist (slowdown and slight magnetism near targets).
- Camera shake and kick are small; accessibility options let players reduce them.
- Reload and weapon switch can be canceled by sprint or fire where the design allows; long uncancellable animations feel sluggish.

## Balancing norms

Time to kill (TTK) is the master lever. Tune damage, fire rate and HP as one system:

```text
shots_to_kill = ceil(target_hp / damage_per_shot)
ttk_seconds   = (shots_to_kill - 1) / fire_rate_per_second      # first shot at t = 0
```

| Knob | Norm |
| --- | --- |
| TTK | low (under about 0.3 s) favors positioning and first shot; high (about 0.6 s and up) favors tracking and teamwork |
| Headshot multiplier | 1.5 to 2.0; rewards skill with a faster TTK without lowering body TTK |
| Falloff | full damage to about 20 m, floor (about 40%) by about 60 m for hitscan rifles; tune per weapon class |
| Weapon roles | each weapon wins at some range or situation; no gun dominates all ranges |
| Reload | a vulnerability window; magazine size sets fight rhythm |
| PvE enemies | burst fire with pauses, a reaction delay, cover use and a cap on simultaneous attackers |

## Pitfalls

- Mouse look scaled by delta time or smoothed by default: sensitivity varies with frame rate and aim feels laggy.
- Pure random recoil or spread on the first shot.
- No falloff on hitscan: pistols snipe across the map.
- No hit feedback: players can't tell if shots land.
- TTK mismatched to the game's pace (twitchy or spongy).
- Trusting the client in multiplayer: keep the server authoritative and use lag compensation (the server rewinds targets to what the shooter saw). Defer netcode to `godot-multiplayer` or the engine's multiplayer docs.
- No FOV or sensitivity options: motion sickness and accessibility failures.

## Engine pointers

- Character body, raycasts and projectile collision: `godot-physics` (Godot).
- Camera, input map and rebinding: `godot` (camera and input references).
- Enemy states and navigation: `game-ai` plus `godot` (navigation reference).
- Shake, hit-stop, recoil kick feel: `game-feel`; weapon audio: `game-audio`.
