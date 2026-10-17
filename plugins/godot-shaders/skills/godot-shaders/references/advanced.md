# Advanced rendering: stencil, compositor, Shader Baker, AA

All of this needs the Forward+ or Mobile renderer unless noted. Keep these sections short in answers; most projects need one of them at most.

## Stencil effects (4.5+, experimental)

Spatial shaders only; canvas_item has no stencil. Mark pixels in one pass, test them in a later pass. Use for x-ray silhouettes, portals and windows, outline masks and holes in geometry. The API is marked experimental and may change in a minor release.

`StandardMaterial3D` has presets: Stencil > Mode = Outline or X-Ray (Godot adds and owns a `next_pass` material; put your own extra pass in `GeometryInstance3D.material_overlay` instead, or it is overwritten) or Custom (flags, compare, reference). The shader form is a separate statement after `render_mode`:

```
stencil_mode <flags...>, <compare>, <reference 0-255>;
```

- Flags: `read`, `write`, `write_depth_fail` (write where the depth test fails). The engine source spells it `write_depth_fail`; one docs table says `write_if_depth_fail`, which doesn't compile.
- Compare: `compare_always`, `compare_equal`, `compare_not_equal`, `compare_less`, `compare_less_or_equal`, `compare_greater`, `compare_greater_or_equal`.
- Reads work only in the transparent pass; a read in the opaque pass fails. Compositor effects can't copy the main stencil buffer.

X-ray: the mask writes 1, the hidden object draws only where the stencil is 1.

```glsl
// portal_mask.gdshader: on the window or portal mesh
shader_type spatial;
render_mode unshaded;
stencil_mode write, compare_always, 1;

void fragment() {
    ALBEDO = vec3(0.0);
    ALPHA = 0.0;                    // invisible, but still writes the stencil
}
```

```glsl
// xray.gdshader: on the object to reveal
shader_type spatial;
render_mode unshaded, depth_test_disabled;
stencil_mode read, compare_equal, 1;

void fragment() {
    ALBEDO = vec3(0.2, 0.8, 1.0);
    ALPHA = 1.0;                    // writing ALPHA keeps it in the transparent pass, where reads work
}
```

Draw order matters: give the mask material a lower `render_priority` than the reader so it renders first.

## Compositor and CompositorEffect

A `Compositor` resource on a `WorldEnvironment` (all viewports) or a `Camera3D` (that camera's viewport) holds an ordered array of `CompositorEffect`s; lower indices run first. Each effect is a `@tool` script that runs on the render thread and records `RenderingDevice` work, usually a compute shader over the color buffer. Reach for it for depth- or normal-aware full-screen passes and custom AO or outline passes that `Environment` and a screen-texture overlay can't do. Forward+ and Mobile only.

```gdscript
@tool
class_name EdgePass
extends CompositorEffect

var rd: RenderingDevice

func _init() -> void:
    effect_callback_type = EFFECT_CALLBACK_TYPE_POST_TRANSPARENT
    needs_normal_roughness = true          # Forward+ only
    rd = RenderingServer.get_rendering_device()
    # compile the compute shader and create the pipeline here (RenderingDevice API)

func _render_callback(callback_type: int, render_data: RenderData) -> void:
    if callback_type != EFFECT_CALLBACK_TYPE_POST_TRANSPARENT:
        return
    var buffers := render_data.get_render_scene_buffers() as RenderSceneBuffersRD
    if buffers == null:
        return
    var size := buffers.get_internal_size()
    for view in buffers.get_view_count():
        var color := buffers.get_color_layer(view)
        # bind `color` as an image uniform, push constants, dispatch ceil(size / 8) groups

func _notification(what: int) -> void:
    if what == NOTIFICATION_PREDELETE and rd:
        pass                               # rd.free_rid(shader) for every RID you created
```

Callback points: `PRE_OPAQUE`, `POST_OPAQUE`, `POST_SKY`, `PRE_TRANSPARENT`, `POST_TRANSPARENT`. Request extra buffers with `needs_motion_vectors`, `needs_normal_roughness`, `access_resolved_color`, `access_resolved_depth`. Start from the official "The Compositor" tutorial and its demo project rather than writing the RenderingDevice boilerplate from memory; free every RID you create.

## Shader Baker (4.5+)

Bakes shaders to the target driver's intermediate format at export (SPIR-V for Vulkan, DXIL for Direct3D 12, MIL for Metal) and embeds them in the PCK. It shortens the first launch, most on Direct3D 12 and Metal, where conversion is slow. It does not build GPU pipelines, so first-draw stutter remains; that's what pipeline precompilation addresses.

- Enable per preset: Export dialog > Shader Baker > Enabled (`shader_baker/enabled`, off by default). Exports get slower and the PCK grows by a few MB.
- Bakes only for the `rendering/rendering_device/driver` setting of the target platform, and only drivers the exporting OS supports: Windows exports Vulkan and D3D12, macOS Vulkan and Metal, Linux and Android Vulkan only.
- No effect with the Compatibility renderer or the Compatibility fallback, so not on the Web. Always off for dedicated-server exports.
- Not supported with `--headless` exports: the editor needs the GPU. CI that bakes must export on a runner with a GPU and display (see `godot-export`).

## Pipeline precompilation and stutter

4.4+ uses ubershaders and precompiles pipelines when meshes, materials and nodes load, often on background threads. It only knows about what the `RenderingServer` has seen, so:

- Load scenes behind a loading screen instead of instancing them mid-gameplay.
- Effects created only at runtime (a material assigned in code, a particle system spawned on hit) may still hitch the first time; instance a hidden copy during loading.
- Compatibility has none of this: show every material, shader and particle effect in view for at least one frame while loading.

## Screen-space AA

`rendering/anti_aliasing/quality/screen_space_aa`: Disabled, FXAA (cheapest, blurry), SMAA (4.5+, sharper than FXAA for a little more cost). Combine with MSAA (`msaa_2d`, `msaa_3d`) for geometry edges or TAA for shimmering detail. The project setting is read at startup; at runtime set `get_viewport().screen_space_aa`. Forward+ and Mobile only.
