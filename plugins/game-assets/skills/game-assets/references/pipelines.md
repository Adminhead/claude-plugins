# 2D and 3D asset pipelines

Read this for sprite, tile, background, UI and 3D production steps and the per-engine import checkpoints. Generated or bought output is source material; dimensions, grids, alpha, anchors and import settings stay deterministic engineering work.

## Sprites and animation

1. Approve one idle or neutral seed at the final view and game scale.
2. Lock canvas size, baseline or ground point, facing, palette, outline, proportions and costume.
3. For a short animation, produce the whole action as one strip referenced to the seed; separately made frames drift more. Treat a generated grid as a candidate, never exact data.
4. Slice and normalize frames with one shared scale and one shared anchor, usually bottom-centre.
5. If frame 1 must match the shipped idle pose, restore the exact seed after slicing.
6. Preview as a contact sheet and in motion: volume, foot sliding, silhouette, cadence.

True pixel art: enforce a real pixel grid after generation. Remove blended pseudo-pixels, single-pixel noise, excess colors, banding and inconsistent clusters. Resize only with nearest-neighbour, and only by integer factors.

## Tiles and tileable textures

- Define tile size and neighbour rules (corners, edges, inner corners, the engine's terrain or autotile layout) before drawing.
- Produce base, transitions, corners, isolated pieces and decoration as one family.
- Keep collision meaning legible; decorative shadows must not look like walls.
- Test seamless materials in a 3×3 repeat at full size and at the most zoomed-out camera.
- Test terrain combinations in the engine's terrain or autotile system, not only on the sheet.
- Add padding or extrusion the atlas tool and engine expect, to stop texture bleeding at fractional camera positions.

## Backgrounds and parallax

- Split sky, far, mid, near and foreground by intended scroll speed.
- Keep unique landmarks away from horizontal seams on repeating layers.
- Keep a low-contrast band behind characters and projectiles.
- Keep focal detail out of HUD safe areas.
- Export layers separately with overlap so camera movement can't show gaps.

## UI art and icons

- Labels, numbers, dynamic copy, focus state and accessibility text stay code-native, never baked into images.
- Draw or generate ornament, frames, portraits and textures, not functional text.
- One icon family. Simple geometric symbols as SVG.
- Provide normal, hover or focus, pressed, disabled, selected and warning states where the art changes.
- Scalable panels as 9-slice (nine-patch); check corners and borders at several sizes.

## 3D, briefly

1. Lock view, scale, gameplay footprint, material language, polygon and texture budgets, engine and platform.
2. Use orthographic or turnaround concepts as references; a generated multi-view sheet still needs geometric interpretation.
3. Author or clean in a DCC such as Blender: topology, normals, UVs, texel density, material slots, rig, weights, clips.
4. Apply transforms; put the origin where gameplay needs it (door hinge, wheel axle, pickup centre).
5. Make simplified collision proxies; never use the render mesh as collision by default.
6. Define LODs and reuse materials and atlases for repeated or distant objects.
7. Export glTF 2.0 (`.glb`) as the default runtime interchange where the engine supports it; keep the editable DCC source separately.
8. Import into the engine and check scale, orientation, materials and animation; profile memory and draw calls.

Never infer clean topology, UVs, rigging, licensing or efficient materials from a preview render, generated or not. Record the tool and version in the manifest.

## Import checkpoints

**Godot 4** (checked against the 4.7 docs; follow the project's version from `project.godot`):

- Texture filtering and repeat are not import options. Set them on the node (`CanvasItem.texture_filter`, `texture_repeat`) or project-wide in `rendering/textures/canvas_textures/default_texture_filter` (Nearest for pixel art). In 3D, set filtering on the material or the shader's sampler hints. Old "Flags > Filter" advice is Godot 3.
- Texture import Compress Mode defaults to Lossless. "Detect 3D" switches a texture used in 3D to VRAM Compressed with mipmaps. Pick VRAM compression deliberately for large 3D textures; keep pixel art Lossless.
- Generate mipmaps (`mipmaps/generate`) only for textures shown much smaller than their size, mainly in 3D.
- Commit each asset's `.import` file and, for scripts and shaders, the `.uid` sidecar (4.4+); never commit `.godot/`.
- Check `Sprite2D`, `AnimatedSprite2D` frames, atlas regions and the `TileSet` terrain setup in the editor. TileMap node specifics are in the `godot` skill.

**Unity:** Texture Type Sprite (2D and UI), Sprite Mode Single or Multiple, one Pixels Per Unit for the whole game, Filter Mode Point for pixel art, compression None or high quality for pixel art, mipmaps off for 2D, Read/Write off unless runtime pixel access is needed.

**Web engines (Phaser, PixiJS, three.js):** keep atlas metadata and file names stable; nearest sampling and integer canvas scaling for pixel art; stop CSS resizing from blurring the canvas; check texture bleeding in the real renderer.
