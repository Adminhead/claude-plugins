# Shader fundamentals and the Godot language

## Contents

- Shader types and processor functions
- Common built-ins
- Render modes
- Varyings, vertex displacement and custom light()
- Preprocessor and includes
- Precision and performance
- Coordinate spaces and UV math
- Porting GLSL and HLSL to Godot

## Shader types and processor functions

| `shader_type` | Used by | Functions | Main outputs |
|---|---|---|---|
| `canvas_item` | 2D nodes, Controls | `vertex`, `fragment`, `light` | `COLOR`, `NORMAL_MAP`, `LIGHT` |
| `spatial` | 3D surfaces | `vertex`, `fragment`, `light` | `ALBEDO`, `ALPHA`, `EMISSION`, `ROUGHNESS`, `METALLIC`, `NORMAL_MAP`, `DIFFUSE_LIGHT`, `SPECULAR_LIGHT` |
| `particles` | GPUParticles process | `start`, `process` | `TRANSFORM`, `VELOCITY`, `COLOR`, `CUSTOM`, `ACTIVE` |
| `sky` | `Sky` resource | `sky` | `COLOR`, `ALPHA`, `FOG` |
| `fog` | `FogVolume` | `fog` | `DENSITY`, `ALBEDO`, `EMISSION` |

## Common built-ins

- Global: `TIME`, `PI`, `TAU`, `E`. `TIME` wraps every 3600 s by default.
- canvas_item: `UV`, `COLOR`, `TEXTURE`, `TEXTURE_PIXEL_SIZE`, `SCREEN_UV`, `SCREEN_PIXEL_SIZE`, `VERTEX`, `FRAGCOORD`, `NORMAL_TEXTURE`, `POINT_COORD`, `MODEL_MATRIX`, `CANVAS_MATRIX`.
- spatial: `VERTEX` (model space in `vertex()`, view space in `fragment()`), `NORMAL`, `TANGENT`, `UV`, `UV2`, `COLOR` (vertex color), `VIEW`, `FRAGCOORD`, `SCREEN_UV`, `MODEL_MATRIX`, `VIEW_MATRIX`, `INV_VIEW_MATRIX`, `PROJECTION_MATRIX`, `INV_PROJECTION_MATRIX`, `CAMERA_POSITION_WORLD`, `NODE_POSITION_WORLD`, `INSTANCE_CUSTOM`, `IN_SHADOW_PASS`.
- spatial `light()`: `LIGHT`, `LIGHT_COLOR`, `ATTENUATION`, `SPECULAR_AMOUNT`, `DIFFUSE_LIGHT`, `SPECULAR_LIGHT`.
- Screen samplers: `hint_screen_texture`, `hint_depth_texture`, `hint_normal_roughness_texture` (Forward+ only).

World position in `fragment()`: `(INV_VIEW_MATRIX * vec4(VERTEX, 1.0)).xyz`.

## Render modes

Comma-separated after `render_mode`, on the line after `shader_type`.

- spatial blend: `blend_mix` (default), `blend_add`, `blend_sub`, `blend_mul`, `blend_premul_alpha`.
- spatial depth: `depth_draw_opaque` (default), `depth_draw_always`, `depth_draw_never`, `depth_prepass_alpha`, `depth_test_disabled`.
- spatial culling: `cull_back` (default), `cull_front`, `cull_disabled`.
- spatial lighting: `unshaded`, `diffuse_toon`, `specular_toon`, `specular_disabled`, `vertex_lighting`, `shadows_disabled`, `ambient_light_disabled`, `fog_disabled`, `world_vertex_coords`, `skip_vertex_transform`.
- canvas_item: `blend_mix`, `blend_add`, `blend_sub`, `blend_mul`, `blend_premul_alpha`, `blend_disabled`, `unshaded`, `light_only`, `skip_vertex_transform`, `world_vertex_coords`.
- particles: `keep_data`, `disable_force`, `disable_velocity`, `collision_use_scale`.
- Stencil (spatial, 4.5+) is a separate `stencil_mode` statement; see advanced.md.

## Varyings, vertex displacement and custom light()

```glsl
shader_type spatial;
varying vec3 world_pos;

void vertex() {
    world_pos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
    VERTEX.y += sin(VERTEX.x * 4.0 + TIME * 2.0) * 0.1;   // model-space wave
}

void fragment() {
    ALBEDO = fract(world_pos);
}

void light() {
    float ndl = clamp(dot(NORMAL, LIGHT), 0.0, 1.0);
    float bands = floor(ndl * 3.0) / 3.0;                  // three-band toon ramp
    DIFFUSE_LIGHT += ALBEDO * LIGHT_COLOR * ATTENUATION * bands;
}
```

Writing a `light()` replaces the built-in diffuse and specular model for that material; it runs once per light. Displacing vertices doesn't update the mesh AABB, so large offsets need `extra_cull_margin` or a custom AABB to avoid culling pop.

## Preprocessor and includes

- `#define`, `#ifdef`, `#if`, `#else`, `#endif`, `#undef` work as in C.
- `#include "res://shaders/common.gdshaderinc"` pulls in a `.gdshaderinc` file (no `shader_type` line in it). Include depth is capped at 25.
- Use includes for shared noise, color and lighting helpers instead of copy-pasting.

## Precision and performance

- `lowp`, `mediump`, `highp` qualifiers matter on mobile GPUs. Keep positions, UVs and time in `highp`; colors can be `mediump`.
- Texture fetches and `discard` dominate cost; reuse samples.
- Branches on uniforms are cheap; branches on per-pixel values diverge. Prefer `mix`, `step`, `smoothstep`, `clamp`.
- Compute linear-across-triangle values in `vertex()` and pass a `varying`.
- Many unique materials break batching; share one `ShaderMaterial` and vary it with instance uniforms (3D) or vertex colors.

## Coordinate spaces and UV math

- Space chain: model, world (`MODEL_MATRIX`), view (`VIEW_MATRIX`), clip (`PROJECTION_MATRIX`). In a spatial `fragment()`, `VERTEX`, `NORMAL` and `VIEW` are view space. Mixing spaces is the most common lighting bug; convert to one space first.
- Interpolated normals and directions shrink; `normalize()` them in `fragment()` before `dot()`.
- UVs run 0 to 1 with (0, 0) at the top left in canvas_item. Scroll with `UV + speed * TIME` and `repeat_enable` (or `fract()`); scale with `UV * tiling`; rotate around the center with a `mat2`.
- Pixel-perfect sampling: `filter_nearest` on the sampler, and snap with `floor(UV / TEXTURE_PIXEL_SIZE) * TEXTURE_PIXEL_SIZE`.
- Fresnel: `pow(1.0 - clamp(dot(N, V), 0.0, 1.0), power)` with both vectors normalized and in the same space.

## Porting GLSL and HLSL to Godot

| GLSL / HLSL | Godot |
|---|---|
| `void main()` | `void fragment()` or `void vertex()` |
| `gl_FragColor`, `out vec4` / `SV_Target` | `COLOR` (2D) or `ALBEDO` + `ALPHA` (3D) |
| `gl_FragCoord` / `SV_Position` | `FRAGCOORD` |
| `uniform float iTime` (Shadertoy) | `TIME` |
| `iResolution` | `1.0 / SCREEN_PIXEL_SIZE` or a uniform |
| `fragCoord / iResolution.xy` | `SCREEN_UV` or `UV` |
| `texture2D()` | `texture()` |
| HLSL `lerp`, `frac`, `fmod`, `rsqrt`, `ddx/ddy` | `mix`, `fract`, `mod`, `inversesqrt`, `dFdx/dFdy` |
| HLSL `float2/3/4`, `float4x4` | `vec2/3/4`, `mat4` |
| HLSL `mul(v, M)` (row-major) | `M * v` (column-major) |
| `tex.Sample(samp, uv)` | `texture(tex, uv)` (sampler and texture are one `sampler2D`) |
| `in`/`out` between stages | `varying` |

Watch for: Shadertoy's bottom-left origin versus Godot canvas_item's top-left (flip `UV.y`); `mod` and `fmod` differ for negative inputs; Godot has no `#version` line and no explicit `in`/`out` declarations. On Forward+ and Mobile the clip-space depth range is 0 to 1 (reverse Z); Compatibility uses -1 to 1 (`CLIP_SPACE_FAR` tells you which).
