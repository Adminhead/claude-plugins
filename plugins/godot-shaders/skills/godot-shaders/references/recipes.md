# Shader recipes

Ready-to-adapt effects. Dissolve and rim light are in SKILL.md.

## Contents

- 2D: outline, hit flash, palette swap, scrolling UV, wave distortion
- 3D: toon shading, simple water
- Post-processing: overlay, vignette, CRT, SubViewport chain, WorldEnvironment

## 2D outline

```glsl
shader_type canvas_item;

uniform vec4 outline_color : source_color = vec4(0.0, 0.0, 0.0, 1.0);
uniform float width : hint_range(0.0, 8.0, 0.5) = 1.0;

void fragment() {
    vec4 tex = texture(TEXTURE, UV);
    vec2 o = TEXTURE_PIXEL_SIZE * width;
    float a = texture(TEXTURE, UV + vec2(o.x, 0.0)).a;
    a = max(a, texture(TEXTURE, UV - vec2(o.x, 0.0)).a);
    a = max(a, texture(TEXTURE, UV + vec2(0.0, o.y)).a);
    a = max(a, texture(TEXTURE, UV - vec2(0.0, o.y)).a);
    COLOR = mix(vec4(outline_color.rgb, outline_color.a * a), tex, tex.a);
}
```

The outline can only draw inside the sprite's quad, so leave transparent padding around the art (or grow the quad in `vertex()`). Add the four diagonals for a rounder outline. For atlas regions, neighbours bleed in from adjacent frames unless the frames are padded.

## Hit flash

```glsl
shader_type canvas_item;
uniform float flash : hint_range(0.0, 1.0) = 0.0;
uniform vec4 flash_color : source_color = vec4(1.0);

void fragment() {
    vec4 tex = texture(TEXTURE, UV);
    COLOR = vec4(mix(tex.rgb, flash_color.rgb, flash), tex.a);
}
```

Tween `shader_parameter/flash` from 1 to 0 over about 0.1 s. Make the material local to the scene (Resource > Local to Scene) or duplicate it per instance, or every enemy flashes together.

## Palette swap

```glsl
shader_type canvas_item;
uniform vec4 from_color : source_color = vec4(1.0, 0.0, 0.0, 1.0);
uniform vec4 to_color : source_color = vec4(0.0, 0.0, 1.0, 1.0);
uniform float tolerance : hint_range(0.0, 1.0) = 0.1;

void fragment() {
    vec4 tex = texture(TEXTURE, UV);
    float hit = step(distance(tex.rgb, from_color.rgb), tolerance);
    COLOR = vec4(mix(tex.rgb, to_color.rgb, hit), tex.a);
}
```

For many colors, use a 1D palette texture indexed by a grayscale value in the art instead of chained comparisons.

## Scrolling UV (water, lava, clouds)

```glsl
shader_type canvas_item;
uniform sampler2D flow_tex : repeat_enable, filter_linear;
uniform vec2 speed = vec2(0.1, 0.05);

void fragment() {
    COLOR = texture(flow_tex, UV + speed * TIME) * COLOR;
}
```

## Wave distortion

```glsl
shader_type canvas_item;
uniform float amplitude : hint_range(0.0, 0.1) = 0.02;
uniform float frequency : hint_range(0.0, 50.0) = 10.0;
uniform float speed : hint_range(0.0, 10.0) = 2.0;

void fragment() {
    vec2 uv = UV;
    uv.x += sin(uv.y * frequency + TIME * speed) * amplitude;
    COLOR = texture(TEXTURE, uv);
}
```

## Toon shading (3D)

```glsl
shader_type spatial;
uniform vec4 base_color : source_color = vec4(0.8, 0.3, 0.3, 1.0);
uniform int bands : hint_range(2, 8) = 3;

void fragment() {
    ALBEDO = base_color.rgb;
}

void light() {
    float ndl = clamp(dot(NORMAL, LIGHT), 0.0, 1.0);
    float stepped = floor(ndl * float(bands)) / float(bands);
    DIFFUSE_LIGHT += ALBEDO * LIGHT_COLOR * ATTENUATION * stepped;
}
```

The built-in alternative is `render_mode diffuse_toon, specular_toon;`. For ink outlines, add a second material pass (`next_pass`) with `render_mode cull_front, unshaded;` that pushes `VERTEX += NORMAL * width;`, or use the `StandardMaterial3D` stencil outline preset (4.5+).

## Simple water (3D)

```glsl
shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_back;

uniform vec4 water_color : source_color = vec4(0.1, 0.3, 0.6, 0.8);
uniform sampler2D wave_noise : filter_linear_mipmap, repeat_enable;
uniform float wave_speed : hint_range(0.0, 1.0) = 0.05;
uniform float wave_height : hint_range(0.0, 2.0) = 0.3;

void vertex() {
    float h = texture(wave_noise, VERTEX.xz * 0.1 + TIME * wave_speed).r;
    VERTEX.y += h * wave_height;
}

void fragment() {
    ALBEDO = water_color.rgb;
    ALPHA = water_color.a;
    METALLIC = 0.0;
    ROUGHNESS = 0.05;
    SPECULAR = 0.5;
}
```

The plane needs enough subdivisions for the displacement to show. Depth-based shore foam reads `hint_depth_texture` and compares linear depths (see the depth gotcha in SKILL.md).

## Post-processing

**Overlay (2D or 3D):** a `CanvasLayer` (high `layer`) with a full-rect `ColorRect`, Mouse Filter set to Ignore, and a canvas_item shader that reads `hint_screen_texture`.

```glsl
shader_type canvas_item;
uniform sampler2D screen_tex : hint_screen_texture, filter_linear;
uniform float strength : hint_range(0.0, 1.0) = 0.5;
uniform float radius : hint_range(0.0, 1.0) = 0.75;

void fragment() {
    vec3 c = texture(screen_tex, SCREEN_UV).rgb;
    float d = distance(SCREEN_UV, vec2(0.5));
    float v = smoothstep(radius, radius * 0.5, d);       // 1 in the middle, 0 at edges
    COLOR = vec4(c * mix(1.0 - strength, 1.0, v), 1.0);
}
```

**CRT and scanlines:** apply to a `SubViewportContainer` (its `TEXTURE` is the rendered SubViewport) so the barrel warp can sample outside the current pixel:

```glsl
shader_type canvas_item;
uniform float lines : hint_range(0.0, 1000.0) = 300.0;
uniform float line_opacity : hint_range(0.0, 1.0) = 0.15;
uniform float curvature : hint_range(0.0, 10.0) = 2.0;

void fragment() {
    vec2 uv = UV * 2.0 - 1.0;
    uv *= 1.0 + dot(uv, uv) * curvature * 0.01;
    uv = uv * 0.5 + 0.5;
    if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) {
        COLOR = vec4(0.0, 0.0, 0.0, 1.0);
    } else {
        vec4 c = texture(TEXTURE, uv);
        c.rgb -= (sin(uv.y * lines * PI) * 0.5 + 0.5) * line_opacity;
        COLOR = c;
    }
}
```

**SubViewport chain:** `SubViewportContainer` (shader material, `stretch = true`) > `SubViewport` > game scene. Chain several containers for multi-pass effects, or render at low resolution and upscale for pixel-art looks.

**3D built-ins first:** `WorldEnvironment` > `Environment` covers tonemapping, glow, SSAO, SSIL, SSR, SDFGI, fog, volumetric fog, depth of field (on the `CameraAttributes`), and adjustments (brightness, contrast, saturation, color correction LUT). Reach for a custom pass only when those fall short; custom passes inside the renderer are `CompositorEffect` (advanced.md).
