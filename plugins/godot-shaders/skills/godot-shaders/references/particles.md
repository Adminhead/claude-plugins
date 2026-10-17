# Particles and VFX

## Contents

- GPU or CPU
- Setup
- Node properties
- One-shot bursts
- ParticleProcessMaterial
- Trails
- Subemitters
- Attractors, collision and turbulence (3D)
- Flipbooks
- Custom particle shaders
- Performance
- Pitfalls

## GPU or CPU

| Node | Simulated on | Use |
|---|---|---|
| `GPUParticles2D/3D` | GPU | default; high counts, trails, subemitters, attractors, collision, particle shaders |
| `CPUParticles2D/3D` | CPU | low-end or Compatibility targets with few particles, or when code must read particle positions |

Convert in the editor: select the node > Particles menu > Convert to CPUParticles (and back). CPU particles have no trails, subemitters, attractors or `particles` shaders.

## Setup

1. Add `GPUParticles2D/3D`; set Process Material to a new `ParticleProcessMaterial`.
2. 2D: set `texture`. 3D: set Draw Pass 1 to a mesh (`QuadMesh` for billboards) with its own material (`StandardMaterial3D` with Billboard Mode set to Particle Billboard, and `vertex_color_use_as_albedo` on so particle color shows).
3. Set `amount`, `lifetime`, emission shape, direction, velocity, gravity, then color and scale curves.
4. 2D: Particles menu > Generate Visibility Rect, or particles vanish when the emitter's default rect leaves the screen.

## Node properties

| Property | Default | Notes |
|---|---|---|
| `emitting` | true | start or stop |
| `amount` | 8 | max alive at once; changing it restarts the system |
| `amount_ratio` | 1.0 | fraction to emit without restarting; varies emission over time but saves no GPU work |
| `lifetime` | 1.0 | seconds per particle |
| `one_shot` | false | emit one cycle then stop |
| `explosiveness` | 0.0 | 1.0 emits all at once |
| `preprocess` | 0.0 | seconds simulated before the first frame (ambient effects) |
| `fixed_fps` | 30 | simulation rate; `interpolate` smooths between steps |
| `local_coords` | false | true: particles move with the node |
| `speed_scale` | 1.0 | 0 pauses the simulation |
| `draw_order` | index | lifetime or reverse lifetime for correct alpha sorting |
| `visibility_rect` / `visibility_aabb` | small default | culling bounds; set them to cover the effect |

4.7+ on `GPUParticles3D`: `transform_align = TRANSFORM_ALIGN_LOCAL_BILLBOARD` faces the camera while keeping the axis in `transform_align_axis`.

## One-shot bursts

```gdscript
@onready var burst: GPUParticles2D = $Burst

func _ready() -> void:
    burst.one_shot = true
    burst.emitting = false
    burst.finished.connect(queue_free)          # free the effect scene when done

func play() -> void:
    burst.restart()                              # clears old particles, starts a new cycle
```

`finished` fires only for one-shot emitters. Setting `emitting = true` just after a cycle ends can be ignored for a moment because the GPU is still finishing; `restart()` avoids that. Don't free on a timer of `lifetime` plus a margin.

## ParticleProcessMaterial

- Emission: `emission_shape` (point, sphere, sphere surface, box, ring, points, directed points); points shapes take baked textures from Particles > Create Emission Points From Node/Mesh.
- Motion: `direction`, `spread` (degrees), `initial_velocity_min/max`, `gravity` (default `(0, -9.8, 0)`; in 2D positive Y is down, so "up" is `(0, -1, 0)`), `damping_min/max`, `radial_accel_*`, `tangential_accel_*`, `orbit_velocity_*` (2D).
- Rotation: `angle_min/max`, `angular_velocity_min/max` (degrees per second).
- Look: `scale_min/max`, `scale_curve` (a `CurveTexture`), `color`, `color_ramp` (a `GradientTexture1D` over lifetime, multiplied with `color`), `color_initial_ramp`, `hue_variation_*`.
- 4.7+: per-axis `use_scale_3d` with `scale_3d_min/max`, `use_rotation_3d` with `rotation_3d_min/max` (degrees), `use_rotation_velocity_3d` with `rotation_velocity_3d_min/max`, and `particle_flag_inherit_emitter_scale` (no effect when `local_coords` is true).

Fade out by ending the `color_ramp` at alpha 0, and shrink with a `scale_curve`, rather than letting particles pop.

## Trails

Forward+ and Mobile only. Set `trail_enabled = true` and `trail_lifetime` on the node. In 3D, Draw Pass 1 becomes a `RibbonTrailMesh` (flat, sword swings) or `TubeTrailMesh` (lasers), and its `StandardMaterial3D` needs Use Particle Trails enabled in the Transform group. Lower `sections` and `section_segments` to save geometry.

## Subemitters

On the parent's process material set `sub_emitter_mode` (constant, at end, at collision, at start) and the amount or frequency; point the parent node's `sub_emitter` at the child particles node. The child's `amount` caps how many subemitted particles can live at once, so raise it. `sub_emitter_keep_velocity` (default false) passes the parent particle's velocity on. A system can't be its own subemitter.

## Attractors, collision and turbulence (3D)

- Attractors: `GPUParticlesAttractorSphere3D`, `Box3D`, `VectorField3D`; `strength` (negative repels), `attenuation`, `directionality`. `attractor_interaction_enabled` on the material is on by default.
- Collision: `GPUParticlesCollisionSphere3D`, `Box3D`, `HeightField3D` (terrain, follows the camera), `SDF3D` (baked from meshes; Forward+ and Mobile only). On the material, `collision_mode` (rigid or hide on contact), `collision_bounce`, `collision_friction`.
- 2D particles collide with `LightOccluder2D` shapes when the material's collision mode is set.
- Turbulence: `turbulence_enabled`, `turbulence_noise_strength`, `turbulence_noise_scale`, `turbulence_noise_speed`, `turbulence_influence_min/max`. Costly on mobile.

## Flipbooks

2D: give the node a `CanvasItemMaterial` with Particles Animation on and H/V Frames matching the sheet; on the process material set `anim_speed_min/max` and `anim_offset_min/max`. 3D: the draw-pass `StandardMaterial3D` has the same Particles Anim settings under Billboard. Use additive blend for fire and sparks on black backgrounds.

## Custom particle shaders

```glsl
shader_type particles;
uniform float speed = 2.0;

void start() {
    if (RESTART_POSITION) {
        TRANSFORM = EMISSION_TRANSFORM;
    }
    if (RESTART_VELOCITY) {
        VELOCITY = vec3(0.0, speed, 0.0);
    }
    CUSTOM.y = 0.0;                              // our own age counter
}

void process() {
    CUSTOM.y += DELTA;
    VELOCITY.x += sin(TIME * 3.0 + float(INDEX)) * DELTA;
    COLOR.a = clamp(1.0 - CUSTOM.y / LIFETIME, 0.0, 1.0);
}
```

Particle shaders keep last frame's output, so integrate with `DELTA`. Built-ins include `LIFETIME`, `DELTA`, `INDEX`, `NUMBER`, `RANDOM_SEED`, `ACTIVE`, `TRANSFORM`, `VELOCITY`, `COLOR`, `CUSTOM`, `MASS`, `COLLIDED`, `COLLISION_NORMAL`, `ATTRACTOR_FORCE`. Convert a `ParticleProcessMaterial` to a shader (right-click > Convert to ShaderMaterial) to start from working code.

## Performance

- Keep `amount` at the minimum that reads well. For a quality setting, scale `amount` when the effect loads (it restarts the system); `amount_ratio` still allocates and processes every particle, so it saves nothing.
- Ambient systems can run at `fixed_fps` 30 with `interpolate` on.
- Always set `visibility_rect` (2D) or `visibility_aabb` (3D); too big wastes draws, too small culls visible particles.
- Trails, turbulence, collision and big overdraw (large alpha quads) are the expensive parts on mobile.
- 4.7+: `request_particles_process(time, residual)` simulates extra time in one frame (seek a paused effect, for example with `speed_scale = 0`).

## Pitfalls

| Symptom | Cause | Fix |
|---|---|---|
| Nothing visible | no texture (2D) or no Draw Pass mesh (3D) | assign one |
| Particles flash and vanish | `lifetime` too short or alpha ramp ends early | lengthen, check the ramp |
| Color or ramp ignored in 3D | draw-pass material doesn't use vertex color | `vertex_color_use_as_albedo = true`, or `ALBEDO *= COLOR.rgb` in a shader |
| One-shot doesn't fire again | relying on `emitting = true` right after `finished` | call `restart()` |
| Wrong direction in 2D | Y is down | negate Y in `direction` and `gravity` |
| Particles don't follow the emitter | `local_coords = false` | set true for attached effects (false for smoke trails left behind) |
| Pop-in of ambient effects | no warm-up | `preprocess` of 1 to 2 lifetimes |
| Particles disappear at screen edges | culling bounds too small | regenerate the visibility rect or AABB |
| Trails missing | Compatibility renderer or Use Particle Trails off | switch renderer or enable it |
| Subemitter spawns few or none | child `amount` too low | raise it |
| Every instance shares one effect state | shared material edited at runtime | duplicate the material or make it local to scene |
