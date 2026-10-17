# Art direction and consistency

Read this when a game needs a new visual direction, a style refresh, or a way to keep many assets coherent across sessions, tools and contributors.

## Describe a system, not a mood

Settle each axis in observable terms and write the answers into the brief:

| Axis | Questions to settle |
| --- | --- |
| Shape | Rounded, angular, chunky, slender, geometric, organic? Which shapes signal friendly, dangerous, rare, interactive? |
| Silhouette | What must read at game scale? Which parts may never merge into the body mass? |
| Value | How many value bands? Does the subject read in grayscale against common backgrounds? |
| Color | Roles for accent, danger, reward, neutral, environment and UI, with exact swatches |
| Edge | Hard pixel clusters, clean vector, ink line, painterly lost edges, soft 3D bevel? |
| Material | How do metal, cloth, skin, stone, foliage, glass and magic differ? |
| Light | Direction, softness, contrast, ambient color, rim light, baked shading policy |
| Detail | Where is detail concentrated? What disappears at native size? |
| Camera | Orthographic or perspective, angle, horizon, facing and turn conventions |
| Motion | Snappy, elastic, weighty, restrained? How far may forms deform? |

"Beautiful", "cinematic" and "high quality" are not constraints. Translate reference images into palette, geometry, composition, material, light and mark-making.

## Palette and scale rules

- Fix the palette as named roles with hex values (or a palette image) and a maximum color count per asset for pixel art.
- Keep gameplay-critical colors (danger, pickups, the player) unique to their role; environment art must not reuse them.
- Fix world scale once: tile size, pixels per unit, character height in tiles, and the integer zoom levels the camera uses. Every asset spec states its size in those units.
- One light direction for the whole game unless the art direction says otherwise.

## Build the visual target

1. Capture the real game viewport at native resolution.
2. Place a representative character, an environment patch, an effect and a HUD fragment together.
3. Show it over common and worst-case backgrounds.
4. Add the role-labelled palette.
5. Record do and don't examples: acceptable silhouettes, forbidden outline drift, allowed texture noise.
6. Approve it before producing a catalog.

The target is a contract. Compare later output against it at the same size and under the same background and light.

## Keep a family coherent

- Reuse one approved seed or reference for related variants.
- Keep a prompt card with the invariant blocks separate from the per-asset block.
- Generate related items in small batches when shared scale and light matter.
- Change one variable per edit pass; broad "make it better" edits drift.
- Keep naming, pivots, canvas size and padding deterministic outside any generator.
- Reject outputs that look good alone but belong to a different visual system.

## Naming

Pick one scheme and write it in the brief, for example `<category>_<subject>_<state>_<frame>.png` in lowercase snake_case (`chr_player_run_03.png`, `tile_grass_corner_ne.png`, `ui_icon_coin.svg`). Zero-pad frame numbers. Folder by category, not by source tool. Never rename a shipped asset without updating every reference and, in Godot, moving its `.import` and `.uid` sidecars with it (or renaming in the editor).

## Evaluate at three distances

1. **Native game scale:** identity and state read immediately.
2. **Working scale:** edges, anatomy, seams, clusters and material cues are inspectable.
3. **Context:** in a real gameplay capture with lighting, effects, UI and neighbours.

An asset that only works zoomed in is not working game art.

## Drift signals

- Character height, head ratio, limb thickness or costume layers change between states.
- Outline color or width changes between neighbouring assets.
- Highlights imply different light directions.
- The palette grows with near-duplicates and muddy intermediates.
- Texture noise density rises on later generations.
- Camera angle or projection shifts across an isometric or top-down set.
- Ground contact and shadow footprint move between frames.
- Icons mix filled, outlined, bevelled and painterly treatments.

When drift appears, go back to the approved seed and make a constrained edit. Don't keep editing a drifted derivative until it becomes the accidental new reference.
