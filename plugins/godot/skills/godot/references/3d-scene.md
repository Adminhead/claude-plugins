# 3D scene setup

Transforms, cameras, lights, environment and post-processing, materials, GI, fog, LOD and culling, GridMap, and the renderer each feature needs. Written for Godot 4.x, checked against 4.7.

Spatial shaders go to `godot-shaders`; 3D bodies and raycasts to `godot-physics`; camera rigs to `references/camera.md`; asset import to `references/import-pipeline.md`.

## Basics

- Right-handed, metres, +Y up, +X right, **-Z forward**. Cameras, lights and `look_at()` all face -Z.
- `position`/`rotation` are parent-relative; `global_position`/`global_transform` are world space. `look_at(target, up)` takes a global point and breaks (NaN or flip) when the target equals the node's position or `up` is parallel to the view direction.
- Non-uniform `scale` on a node with collision children distorts shapes. Scale the mesh asset or use uniform scale.
- Long chains of rotations drift: `basis = basis.orthonormalized()`.
- Minimum visible scene: `Camera3D` (current), a light, and a `WorldEnvironment`. No light and no ambient renders black.
- Picking: `camera.project_ray_origin(pos)` + `project_ray_normal(pos)` into a physics ray query; `unproject_position(world)` for screen-space labels.

## Pick the renderer first

| Feature | Forward+ | Mobile | Compatibility |
|---|---|---|---|
| SDFGI, VoxelGI, SSIL, SSR, volumetric fog | yes | no | no |
| SSAO | yes | no | yes (per the 4.7 docs table) |
| LightmapGI | bake and render | bake and render | render only |
| ReflectionProbe per mesh | unlimited | 8 | 2 |
| CompositorEffect post | yes | yes | no |
| Target | desktop, console | mobile, mid-range | web, low end |

Set it in Project Settings > Rendering > Renderer > Rendering Method. Advice that assumes SDFGI or volumetric fog silently does nothing on Mobile and Compatibility. LightmapGI bakes only in the editor.

## Lights

| Node | Use | Notes |
|---|---|---|
| `DirectionalLight3D` | Sun or moon | Cheapest; PSSM shadows; keep `directional_shadow_max_distance` at the minimum you need (50 to 100 m is typical) |
| `OmniLight3D` | Point | `omni_range` |
| `SpotLight3D` | Cone | `spot_range`, `spot_angle` |
| `AreaLight3D` (4.7+) | Rectangle (screens, neon, softboxes) | `area_size` (default 1x1 m), `area_range` (5), `area_attenuation` (1; 2 is inverse square). PCSS soft shadows; no shadows in Compatibility, fixed penumbra in Mobile. In Forward+ one visible area light adds cost to every rendered object; keep it for cinematics or high-end targets |

- `light_energy` above 1 is valid HDR. `shadow_enabled` costs a lot; enable it where it shows.
- Shadow acne: raise `shadow_normal_bias` before `shadow_bias`. Peter-panning: bias too high.
- `light_bake_mode`: Disabled, Static (fully baked), Dynamic (indirect baked, direct real-time).

## Environment and post

`WorldEnvironment.environment` holds an `Environment`; exposure, DOF and auto-exposure live in a `CameraAttributes` resource.

- Background: `BG_SKY` with a `Sky` using `ProceduralSkyMaterial` (prototype), `PanoramaSkyMaterial` (HDRI) or `PhysicalSkyMaterial` (day and night).
- Ambient: `ambient_light_source` Sky or Color. Dark objects under lights usually mean no ambient.
- Tonemap: `tonemap_mode` Linear, Reinhard, Filmic, ACES or AgX. 4.6+: AgX has `tonemap_agx_white` and `tonemap_agx_contrast`.
- 4.6+: glow default blend mode is Screen (was Soft Light) and `glow_intensity` dropped from 0.8 to 0.3, with new `glow_levels` defaults. Glow on the Mobile renderer was rewritten and looks different. Retune glow after upgrading from 4.5 or earlier.
- 4.6+: SSR was reworked; `ssr_depth_tolerance` default went from 0.2 to 0.5.
- 4.5+: specular occlusion from ambient light is on in all renderers; disable with `rendering/reflections/specular_occlusion/enabled` or `render_mode specular_occlusion_disabled`. 4.5+ adds a Bent Normal slot to `StandardMaterial3D`.
- 4.7+: HDR display output. Turn on Project Settings `display/window/hdr/request_hdr_output` and `rendering/viewport/hdr_2d`; set `use_hdr_2d` on each SubViewport that should be HDR; at runtime use `Window.hdr_output_requested`. Needs Forward+ or Mobile, D3D12 on Windows, Metal on iOS, Wayland on Linux. Filmic and ACES tonemapping, Soft Light glow and Color Correction are SDR only.
- `rendering/reflections/sky_reflections/roughness_layers`: 4.6.0 and 4.6.1 used 7; 4.7 (and 4.6.2) use 8 again.

## Materials

- `StandardMaterial3D` for PBR (`albedo_*`, `metallic`, `roughness`, normal, AO, emission); `ORMMaterial3D` with a packed occlusion/roughness/metallic texture; `ShaderMaterial` for custom looks (`godot-shaders`).
- `material_override` replaces all surfaces; `set_surface_override_material(i, mat)` replaces one.
- Materials are shared resources. `duplicate()` before changing one instance's colour, or every user changes.
- Transparency: Alpha Scissor (fast, casts shadows) or Alpha Hash (dithered, for hair) over plain Alpha (sorted, no shadows, overlap artefacts). Depth Pre-Pass suits mostly opaque meshes with soft edges.

## Global illumination

| Method | Dynamic | Renderer | Use for |
|---|---|---|---|
| Ambient only | yes | all | Stylised or simple scenes |
| `ReflectionProbe` | optional (`UPDATE_ONCE` is free at runtime) | all | Local reflections in rooms |
| `LightmapGI` | no | see table above | Static scenes, best quality, free at runtime |
| `VoxelGI` | yes | Forward+ | Small to medium dynamic scenes |
| SDFGI (`sdfgi_enabled`) | yes | Forward+ | Large open worlds |

LightmapGI workflow: lights to Bake Mode Static, meshes to GI Mode Static (UV2 is generated on import), Bake Lightmaps, and commit the `LightmapGIData`.

## Fog

- Depth and height fog on the Environment: cheap, all renderers.
- Volumetric fog and `FogVolume` nodes: Forward+ only.
- 4.6+: volumetric fog blending became more physically accurate, so fog tuned on 4.5 looks brighter. Lower the density or the lights' Volumetric Fog Energy. 4.7+: `rendering/environment/fog/use_legacy_blending` restores the old blending.

## LOD, culling, instancing

- Mesh LOD is generated on import for glTF, .blend and FBX. Tune with `lod_bias` per instance and Rendering > Mesh LOD > Threshold Pixels globally.
- Manual LOD: `visibility_range_begin`/`end` with `visibility_range_fade_mode`; overlap ranges for a crossfade.
- Occlusion culling: enable Rendering > Occlusion Culling, add an `OccluderInstance3D`, Bake Occluders from static geometry only. Moving occluders forces rebuilds.
- `MultiMeshInstance3D` draws thousands of identical meshes in one call. Set `instance_count` before `set_instance_transform()`, or instances stay invisible.
- `Decal` projects textures (bullet holes, grime); check its Y extent and `cull_mask` when nothing shows. Forward+ shares 512 clustered slots between omni and spot lights, decals and reflection probes.

## GridMap

- Build a scene of meshes (with optional collision) and export it as a `MeshLibrary`. 4.7+: the importer can import a 3D file directly as a `MeshLibrary` or `Mesh` (see `references/import-pipeline.md`).
- Assign `mesh_library` and `cell_size`, then paint or call `set_cell_item(Vector3i, item, orientation)`. `get_cell_item()` returns -1 (`INVALID_CELL_ITEM`) when empty; `set_cell_item(cell, -1)` clears. Orientation index: `get_orthogonal_index_from_basis(basis)`.
- 4.7+: octant queries scope work to a region instead of every cell: `cell_octant_size` (default 8), `get_used_octants()`, `get_octants_in_bounds(aabb)` (includes empty octants), `get_used_octants_in_bounds(aabb)`, `get_used_cells_in_octant(coords)`, `get_octant_coords_from_cell_coords(cell)`.
- 4.7+: `CSGShape3D.autosmooth` with `smoothing_angle` (default 50) for blockouts.
