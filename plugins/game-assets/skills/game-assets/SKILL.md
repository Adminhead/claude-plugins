---
name: game-assets
description: "Art direction and asset pipeline for game art, mainly 2D: a style bible, palette and scale rules, sprite, animation, tileset, UI and icon specs, an asset manifest with naming and licenses, image-generation briefs, and import checks. Use for a game's art style, sprites, tilesets, an asset list or sourcing art."
---

# Game assets

Turn a game's visual intent into a consistent, engine-ready asset set. Image generation, purchased packs and hand-drawn art are all inputs to one controlled pipeline; none of them proves an asset is shippable on its own.

Adapted from awesome-gamedev-agent-skills `create-game-assets` (Apache-2.0, Copyright 2026 Abhishek Barali and contributors), without its Pillow scripts; see LICENSE and NOTICE.

Not for web or app UI visuals (`ui-direction`, `web-design`), game UI layout and menus (`game-ui`), sound (`game-audio`), shaders and juice (`godot-shaders`, `game-feel`), or Steam capsule and screenshot sizes (`game-publish`). Use each one if installed.

## Workflow

1. **Inspect before inventing.** Find existing screenshots, concept art, sprites, fonts, import settings, camera framing, target resolution and naming. Keep a coherent existing direction unless the user asks for a redesign.
2. **Lock the technical frame.** Engine, 2D or 3D, camera and view, native viewport and display scale, asset sizes on screen, world scale (pixels per unit or tile size), transparency, palette size, filtering, frame counts, texture budget, platforms. Copy `assets/art-direction-brief.md` into the project (for example `docs/art-direction-brief.md`) and fill it in.
3. **Name the visual system** in observable properties: shape language, silhouette, value bands, palette roles, edge and outline treatment, light direction, detail density, motion character. Never use a living artist's name as the style definition. Read `references/art-direction.md` for the axis table and drift signals.
4. **Make the asset manifest.** Copy `assets/asset-manifest.json`, then list every asset, state, variant, size, anchor or pivot, collision role, source, license and status. Mark greybox placeholders as placeholders.
5. **Approve one visual target** before producing a full set: a hero asset or a small style board placed in a real gameplay capture, at native scale, over common and worst-case backgrounds. If the user delegated the choice, pick the strongest direction and record why.
6. **Produce families, not one-offs.** Reuse the approved target as the reference for every related asset; keep palette, view, proportions, light, outline and texture density fixed; work in small batches; change one variable per edit.
7. **Normalize deterministically** with ordinary image tools: crop, size, anchor, slice, name, compress, check alpha. Never trust a generated grid, transparency, seam, pivot or dimension without inspecting it.
8. **Import with deliberate engine settings** (filtering, mipmaps, compression, slicing, pixels per unit, color space). Read `references/pipelines.md` for the 2D and 3D pipelines and the per-engine import checkpoints, and the engine skill (such as `godot`) before editing engine files.
9. **Validate in context:** a contact sheet, then the running game at native resolution. Check silhouette, scale, animation stability, seams, legibility, palette and compression artifacts. Fix the source asset, not only runtime compensations.
10. **Record provenance** in the manifest (below) before calling anything production-ready.

## Choose the path

| Need | Default |
| --- | --- |
| Controlled change to an existing asset | Edit the original; state what must stay unchanged |
| New 2D family | Approve a seed, produce the family, normalize, preview, import |
| True pixel art | Treat generated output as a draft; enforce grid, palette, clusters and frames in a pixel editor |
| Tileset or tileable texture | Produce base, transitions, corners and decor as one family; test a 3×3 repeat |
| UI art and icons | Keep text, numbers and focus states code-native; simple symbols as SVG; panels as 9-slice |
| 3D model or material | Concepts are references only; author or clean in a DCC such as Blender |
| No generation or editing tool available | Write the brief and manifest; source licensed assets or keep labelled greybox |

## Image-generation briefs

When an image generation or editing tool is available, this skill owns the brief, the constraints and the acceptance gates; follow the tool's own skill for the call itself. Build prompts from fixed blocks, keeping the invariant blocks identical across a family:

```text
PURPOSE:      production asset for [gameplay role]
SUBJECT:      [object or character and action]
VIEW:         [orthographic | top-down | side | three-quarter], [facing]
ART DIRECTION:[shape language], [palette roles], [materials], [edge treatment]
GAME-SCALE:   [silhouette and focal details that must read at WxH]
OUTPUT:       [dimensions or aspect], [transparent | scene background], [frame or slot count]
LOCKS:        keep [identity, proportions, palette, costume, light, line weight]
EXCLUDE:      text, labels, mockup frames, scenery, duplicates, cropped edges, signatures
```

For edits, state both what changes and what stays fixed. Request transparency through the tool's native option and then verify the alpha channel; prompt wording alone does not guarantee it.

## Checks without bundled scripts

Use whatever the user has: an image editor, the engine's import dock, or ImageMagick (`magick identify -format '%f %wx%h %[channels]\n' sprites/*.png` lists size and alpha; `magick montage sprites/*.png -filter point -geometry 192x192+4+4 -background '#808080' sheet.png` builds a nearest-neighbour contact sheet). Confirm the tool is installed before suggesting a command, and never install packages without asking.

## Quality gates

- **Cohesion:** related assets share palette roles, outline, view, light direction, scale and detail density.
- **Gameplay read:** silhouettes and state changes read at native resolution, in motion, over real backgrounds.
- **Technical fit:** exact size and frame count, clean alpha, stable anchors, correct filtering and color space, nothing clipped, no stray labels.
- **Animation:** identity, volume, proportions and baseline hold across frames; timing reads in an in-engine preview.
- **Tiles and backgrounds:** required edges tile without seams; decoration implies no false collision; parallax layers overlap so the camera cannot expose gaps.
- **Rights:** every shipped file has a recorded source and terms compatible with the release.

An asset is production-ready only after the technical checks and a native-scale, in-engine look.

## Provenance and licenses

Record per shipped asset: ID and path, creator or source URL or order number, date, tool and model version if generated, prompt or reference IDs, license name and version with a saved copy or link to the terms, attribution text and where it must appear, restrictions (commercial use, modification, redistribution of source files), edits and who made them, approval.

- "Free", "royalty-free", search-visible or generated is not a license. Check terms at the original source, not a repost.
- Keep attribution through atlas packing, renaming and edits. A marketplace license that allows shipping in a game may forbid publishing the raw files in a public repo.
- Keep receipts and license snapshots with personal or account data out of public repos.
- Check each store's current AI-content disclosure rules before submission (Steam asks on its content survey).
- When terms are unclear or the release is commercially important, flag it for a human rights review rather than guessing. This is recordkeeping, not legal advice.
