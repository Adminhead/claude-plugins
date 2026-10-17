---
name: godot-shaders
description: Godot 4 shaders and VFX. .gdshader code (canvas_item, spatial, particles), uniforms and hints, screen and depth reading, visual shaders, materials, GPUParticles2D/3D and ParticleProcessMaterial, stencil and CompositorEffect. Use for "write a shader", a dissolve, outline, rim or water effect, a ShaderMaterial, or particles in a Godot project.
license: Apache-2.0 AND MIT
---

# Godot shaders

Godot Shading Language, materials and GPU particles. Written for Godot 4.x, checked against 4.7. Version-gated facts are tagged inline (`4.5+`); per-minor changes live in the `godot` skill's version notes.

Not for: physics, bodies and collisions (`godot-physics`); exporting builds and the Shader Baker preset switch in CI (`godot-export`, though the shader side is below); scene, node and general GDScript work (`godot`); GPU frame-time budgets across engines (`game-performance`).

## Orient first

1. Read the version from `config/features` in `project.godot`; the same line names the renderer (`"Forward Plus"`, `"Mobile"`, `"GL Compatibility"`). Compatibility (and therefore Web) lacks particle trails, SDF particle collision, compositor effects, the normal-roughness texture and the Shader Baker.
2. Find existing `.gdshader` and `.gdshaderinc` files and match their style. Keep the `.uid` sidecar next to a shader when moving or renaming it (4.4+).
3. Pick the shader type on line one: `shader_type canvas_item;` (2D nodes, Controls), `spatial` (3D meshes), `particles` (GPUParticles process), `sky`, `fog`.
4. Prefer a built-in material when it covers the need: `StandardMaterial3D` (including its stencil outline and x-ray presets, 4.5+), `CanvasItemMaterial`, `ParticleProcessMaterial`. Write a shader when they don't.

## Workflow

1. Create a `ShaderMaterial`, assign the `.gdshader`, put it on the node's `material` (2D) or the mesh surface or `material_override` (3D). One `Shader` can back many `ShaderMaterial`s with different uniform values.
2. Write `fragment()` for color, `vertex()` to move geometry, `light()` for custom lighting. Outputs: `COLOR` in canvas_item; `ALBEDO`, `ALPHA`, `EMISSION`, `ROUGHNESS`, `METALLIC`, `NORMAL_MAP` in spatial.
3. Expose tunables as uniforms with hints so the Inspector shows the right widget and colors are converted correctly.
4. Drive values from code with `material.set_shader_parameter("name", value)`, or tween `"shader_parameter/name"`.
5. Check: the shader editor shows no errors, the effect renders on the project's renderer, and for 3D transparency the material is in the expected pass.

## Patterns

Dissolve with a glowing edge (canvas_item):

```glsl
shader_type canvas_item;

uniform sampler2D noise_tex : repeat_enable;     // a NoiseTexture2D
uniform float amount : hint_range(0.0, 1.0) = 0.0;
uniform float edge_width : hint_range(0.0, 0.2) = 0.04;
uniform vec4 edge_color : source_color = vec4(1.0, 0.5, 0.0, 1.0);

void fragment() {
    vec4 tex = texture(TEXTURE, UV);
    float n = texture(noise_tex, UV).r;
    if (n < amount) {
        discard;
    }
    float e = smoothstep(amount, amount + edge_width, n);
    COLOR = vec4(mix(edge_color.rgb, tex.rgb, e), tex.a);
}
```

```gdscript
func dissolve(duration := 1.0) -> void:
    var t := create_tween()
    t.tween_property($Sprite2D.material, "shader_parameter/amount", 1.0, duration)
    t.tween_callback(queue_free)
```

Rim light (spatial). `NORMAL` and `VIEW` are both view space in `fragment()`:

```glsl
shader_type spatial;

uniform vec4 base_color : source_color = vec4(0.2, 0.5, 1.0, 1.0);
uniform vec3 rim_color : source_color = vec3(0.6, 0.8, 1.0);
uniform float rim_power : hint_range(0.5, 8.0) = 3.0;

void fragment() {
    ALBEDO = base_color.rgb;
    float rim = pow(1.0 - clamp(dot(NORMAL, VIEW), 0.0, 1.0), rim_power);
    EMISSION = rim_color * rim;
}
```

Screen reading (4.x has no `SCREEN_TEXTURE`; declare a sampler):

```glsl
shader_type canvas_item;
uniform sampler2D screen_tex : hint_screen_texture, filter_linear_mipmap;

void fragment() {
    COLOR = textureLod(screen_tex, SCREEN_UV, 2.0);   // mip 2 = cheap blur
}
```

Outline, flash, palette swap, scroll, wave, toon, water, vignette, CRT and the SubViewport post chain are in [references/recipes.md](references/recipes.md).

## Uniforms in brief

```glsl
uniform float speed : hint_range(0.0, 10.0, 0.1) = 1.0;
uniform vec4 tint : source_color = vec4(1.0);          // sRGB-correct color picker
uniform int mode : hint_enum("Off", "Soft", "Hard") = 0;
uniform sampler2D albedo_tex : source_color, filter_linear_mipmap, repeat_enable;
uniform sampler2D normal_tex : hint_normal;
group_uniforms Wind;                                    // Inspector grouping
uniform float wind_strength = 1.0;
group_uniforms;
global uniform vec3 player_pos;                         // Project Settings > Shader Globals
instance uniform vec4 variant : source_color;           // per GeometryInstance3D, max 16
```

Global uniforms must exist in Project Settings before the shader saves; set them with `RenderingServer.global_shader_parameter_set()`. Instance uniforms take no textures or arrays; set them with `set_instance_shader_parameter()`.

## Particles

`GPUParticles2D/3D` with a `ParticleProcessMaterial` covers most VFX; write a `particles` shader only for behavior the material lacks. Read [references/particles.md](references/particles.md) for setup, one-shot bursts, trails, subemitters, attractors, collision, turbulence, flipbooks and the pitfall table. The top two traps: one-shot emitters should be restarted with `restart()` and freed on the `finished` signal, and in 3D the draw-pass material ignores particle color unless `vertex_color_use_as_albedo` is on (or a shader does `ALBEDO *= COLOR.rgb`).

## Gotchas

- **3.x names:** `SCREEN_TEXTURE` and `DEPTH_TEXTURE` are gone (declare samplers with `hint_screen_texture`, `hint_depth_texture`; 3D normals via `hint_normal_roughness_texture`); `hint_color` and `hint_albedo` became `source_color`; `WORLD_MATRIX` became `MODEL_MATRIX`, `CAMERA_MATRIX` became `INV_VIEW_MATRIX`, `INV_CAMERA_MATRIX` became `VIEW_MATRIX`.
- **Wrong output:** `COLOR` in a spatial `fragment()` doesn't set the surface color; write `ALBEDO`.
- **Colors without `source_color`** are treated as linear and look washed out or dark.
- **3D transparency:** writing `ALPHA` moves the material to the transparent pass (sorted per object, no screen-space effects, sorting artifacts on overlapping meshes). For cutouts use `ALPHA_SCISSOR_THRESHOLD` or `discard` and stay opaque.
- **Screen texture in 3D** is captured after opaque geometry, so transparent objects are missing from it, and a material that reads it is itself transparent. In 2D, add a `BackBufferCopy` to re-capture between layers.
- **Depth texture** is non-linear; reconstruct position with `INV_PROJECTION_MATRIX * vec4(SCREEN_UV * 2.0 - 1.0, depth, 1.0)` then divide by `w` (Forward+ and Mobile).
- **`TIME`** is seconds since start, wraps every 3600 s by default (`rendering/limits/time/time_rollover_secs`), follows `time_scale` and keeps running while paused. Use a global uniform for pause-aware time; expect a jump at the wrap for non-periodic math.
- **Sampling outside 0 to 1** clamps unless the sampler has `repeat_enable`.
- **`discard`** disables early depth and is slow on tiled mobile GPUs; prefer alpha where you can.
- **`textureQueryLod()`** is fragment-only; 4.7 makes calling it in `vertex()` a compile error.
- **Visual shaders** compile to the same language; 4.7's `LinearToSRGB` node no longer clamps to 0 to 1 on Forward+ and Mobile (add a Clamp node to keep old output). Convert to a text shader for review and diffs.
- **Shader compilation stutter:** the first draw of a new material compiles a pipeline. Instance hidden copies during a loading screen; the Shader Baker (4.5+) shortens first launch but doesn't remove that stutter (see advanced.md).

## References

- [references/fundamentals.md](references/fundamentals.md): read for built-ins per shader type, render modes, varyings, `light()`, the preprocessor and `#include`, coordinate spaces, UV math, and porting GLSL or HLSL code to Godot.
- [references/recipes.md](references/recipes.md): read for ready-made 2D and 3D effects and full-screen post-processing.
- [references/particles.md](references/particles.md): read for any `GPUParticles*`, `CPUParticles*` or `ParticleProcessMaterial` work, or a custom `particles` shader.
- [references/advanced.md](references/advanced.md): read for stencil effects (4.5+), `Compositor` and `CompositorEffect`, the Shader Baker and pipeline precompilation, and screen-space AA choices.

Adapted from awesome-gamedev-agent-skills (Apache-2.0) and GodotPrompter (MIT); see NOTICE.
