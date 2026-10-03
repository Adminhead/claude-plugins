# Dark mode and theming

Read this when adding a dark theme or another theme to a product that has a visual system, or when reviewing one. Extend the existing tokens. Do not introduce a new palette or direction.

A dark theme is a second set of values for the same semantic tokens, not an inversion of the light one. Components reference tokens (`--color-bg`, `--color-surface`, `--color-fg`, `--color-muted`, `--color-border`, `--color-accent`), and the theme redefines those tokens under `:root[data-theme="dark"]` or `@media (prefers-color-scheme: dark)`. If components contain raw color values, replace them with tokens first, because otherwise only one mode can be themed.

## Surfaces and text

- Base the darkest surface on a very dark gray (OKLCH L about 0.16 to 0.22, roughly `#121212` to `#1e1e1e`), not `#000`. Pure black next to bright text causes halation, smears on OLED during scroll, and leaves no room to show elevation.
- Express elevation with lightness. A raised surface is slightly lighter than its parent (about 3 to 4 lightness points per step), because shadows barely register on dark backgrounds. Keep real shadows for floating elements.
- Use off-white for body text (around 87 percent opacity or an `oklch` lightness near 0.93 to 0.95) and step down for secondary and disabled text. Pure white on near-black is harsh.
- Borders are lighter than the surface they sit on in dark mode, not darker.

## Color

- Reusing a saturated light-mode accent unchanged tends to glare. Pick a lighter, less saturated sibling. In OKLCH, raise L, lower C, and keep H.
- Re-check every text, icon, border, and focus pair against its dark surface. A palette that passes in light can fail in dark, and the reverse.
- Icons use `currentColor` so they follow the text color.
- Charts need series that stay distinguishable on the dark surface. Desaturate them a little, keep a clear lightness gap between neighboring series, and draw gridlines at low opacity.

## Switching

- Default to the system preference with `prefers-color-scheme`, and remember an explicit user choice. Apply the stored choice before first paint with a small inline script, to avoid a flash of the wrong theme.
- Do not animate the swap. Transitioning every color at once is slow and janky, so suppress transitions while the theme attribute changes.
- Set `color-scheme: light dark` on the root so native controls and scrollbars follow the theme.

## Review tells

- `#000` background with `#fff` text.
- A light palette flipped mechanically.
- Drop shadows doing the work of elevation on dark.
- Colored glows used by default.
- The light accent reused unchanged.
- Borders darker than the surface.
- A visible color animation when toggling.
