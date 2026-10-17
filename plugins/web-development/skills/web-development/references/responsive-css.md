# Responsive CSS

Read this when a layout needs to adapt to width: a component that moves between containers, fluid type, a grid of cards, full-height sections on mobile, or a table or nav that does not fit. Start from content. Add a breakpoint where the content breaks, not at a device width, and verify at 320 CSS px and at 200% text size.

Browser support, checked on MDN and web.dev: container queries are widely available since February 2023, and the `svh`, `lvh`, and `dvh` units in Chrome 108, Firefox 101, and Safari 15.4. Check the repo's browserslist before relying on a newer feature, and give older browsers a layout that still works.

## Container queries

Use a container query when a reusable component must respond to the width of the space it is placed in. Use a media query for the viewport and for user preferences (`prefers-reduced-motion`, `prefers-color-scheme`).

```css
.card-wrap { container: card / inline-size; }   /* name / type */

@container card (width > 30rem) {
  .card { display: grid; grid-template-columns: 10rem 1fr; }
}
```

- `container-type: inline-size` makes the element a query container for its width and applies inline-size containment. The element can no longer take its width from its content, so give it a width from layout (block flow, grid, flex, or an explicit size) to avoid a collapse.
- A container cannot query itself. Style the descendants, and put the container on a wrapper.
- `container-name` lets a query target a specific ancestor. Without a name, the query uses the nearest ancestor container.
- Container units (`cqi`, `cqw`) size things relative to the container: `font-size: max(1rem, 0.5rem + 2cqi)`.
- For a browser without support, write the default (narrow) layout as the base styles, so the query only enhances it.

## Fluid type and spacing

- `clamp(min, preferred, max)` scales between two sizes. Put the minimum and maximum in `rem` and mix `rem` with `vw` in the preferred value, such as `clamp(1rem, 0.9rem + 0.5vw, 1.25rem)`. A `vw`-only value ignores the user's font-size setting and zoom.
- Keep body text at 1rem or more. Check that text still reflows at 200% zoom.
- Limit line length with `max-width: 65ch` on prose, and aim for 40 to 80 characters.

## Grids without breakpoints

```css
.cards { display: grid; gap: 1rem;
  grid-template-columns: repeat(auto-fit, minmax(min(16rem, 100%), 1fr)); }
```

`min(16rem, 100%)` stops the minimum from forcing overflow in a narrow container. `auto-fit` collapses empty tracks, and `auto-fill` keeps them.

## Viewport height

- `100vh` equals the large viewport, so on mobile browsers with a collapsing toolbar it can extend under the browser UI.
- `svh` is the viewport with the toolbars shown and always fits. `lvh` is the viewport with them hidden. `dvh` follows the toolbar state, so it can cause layout shifts and updates at a throttled rate.
- Use `min-height: 100svh` for a full-screen section. Use `dvh` only when the section must track the toolbar, such as a pinned bottom sheet.

## Logical properties

Use `margin-inline`, `padding-block`, `inline-size`, and `inset-inline-start` instead of left, right, width, and top where the direction can change. Right-to-left languages then work without extra rules.

## Tables and navigation

- Give a wide table a scroll container (`overflow-x: auto` on a wrapper with a focusable region and a label) or restructure the rows into stacked groups under a narrow container. Do not clip it.
- Keep primary navigation visible or reachable. Collapse secondary links into a disclosure button that uses `aria-expanded` and closes on Escape.

## Common failures

- **Horizontal overflow.** Find the element that is wider than its container (a fixed width, an unbroken string, an image without `max-width: 100%`, a flex child without `min-width: 0`). Fix that element. Adding `overflow-x: hidden` to the page hides the defect and can clip content.
- **Text too small on mobile.** A fixed `px` size ignores user settings. Use `rem`.
- **Tap targets too small.** WCAG 2.2 AA requires at least 24 by 24 CSS px, and 44 by 44 is more comfortable for primary controls.
- **Images that stretch.** Set `aspect-ratio` and `object-fit`, and give media an intrinsic size so layout does not shift.
