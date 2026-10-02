# Color for a product with no system

Read this only when the product has no color system and the task needs a baseline. If tokens, themes, or brand colors exist, use them and skip this file. Mark brand assumptions `UNCONFIRMED` and ask the owner to confirm them. `ui-ux-pro-max` (if installed) can suggest starting palettes.

## Build by role

- Keep three to five core colors plus neutrals and status colors, and define each by role (brand, accent, surface, text, border, success, warning, error) so components stay portable.
- Use neutrals for most of the surface, the brand color for structure, and the accent for the action. Reserve strong color for meaning.
- Soften pure black and pure white to a near-black ink and an off-white, tinted slightly toward the brand hue.
- For each important hue, generate a ramp from light to dark and use it for hover, active, surface, and border states. Ease chroma down at both ends so tints do not wash out and shades do not turn muddy.
- Status colors pair with an icon or text. Color is never the only cue.

## Author in OKLCH

`oklch(L C H / A)` is perceptually uniform. Lightness tracks perceived brightness, so a scale has even steps and gradients avoid gray dead zones. L runs 0 to 1, C from 0 to about 0.4, and H 0 to 360 degrees (<https://developer.mozilla.org/en-US/docs/Web/CSS/color_value/oklch>). It is widely available since May 2023.

- Chroma is limited by gamut. A high chroma at some hues falls outside sRGB and clips, so check the result.
- Ship a hex fallback for older targets: `background: #12a594; background: oklch(0.7 0.12 195);`.
- Build a categorical set by holding L and C and rotating H by 360 divided by the number of items, so every item has equal visual weight.
- Make a dark sibling by raising L and lowering C of each accent. See [dark-mode.md](dark-mode.md).

## Verify

- WCAG AA contrast of 4.5:1 for normal text and 3:1 for large text, icons, focus indicators, and any border that is the only boundary of a control, for every pair in its real context. A decorative separator can be lighter, so give input borders a stronger token than `--color-border`.
- View the palette in grayscale to confirm the hierarchy holds without hue.
- Check common color-vision deficiencies for any chart or status UI.

## Starter tokens

[token-core.css](token-core.css) holds semantic tokens for light and dark. Copy values into the product's own token file and adjust the hue to the brand. Do not add it as a second system.
