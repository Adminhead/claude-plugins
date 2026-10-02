# Interface polish

Read this only when the user asks to polish a UI or the review finds details that feel off. Polish is not a license to restyle. Apply these to the existing system, report concrete before and after changes, and omit principles you checked but did not change.

## Shape and alignment

- **Concentric radius.** For nested rounded surfaces, outer radius = inner radius + the padding between them. When the padding is large, treat the layers as separate surfaces instead of forcing the formula.
- **Optical alignment.** Geometric centering is not always visual centering. Play triangles, arrows, and asymmetric icons often need a small offset. Fix the SVG where you can, and otherwise nudge with a pixel of padding.
- **Borders and shadows.** Use a border for separation and focus rings. Use a layered, low-opacity shadow when a card, popover, or menu needs depth. Keep shadows neutral so they work on any background.
- **Image edges.** An image on a similar surface can blur into it. A neutral inset outline helps: `outline: 1px solid rgb(0 0 0 / 0.1); outline-offset: -1px;`. Use black or white alpha, not a brand color.

## Text

- `text-wrap: balance` on headings and short titles. It balances lines and limits itself to 6 lines in Chromium and 10 in Firefox.
- `text-wrap: pretty` on short to medium body text, captions, and list items, to reduce orphans. It is slower, so skip long prose, code, and preformatted text.
- `balance` is Baseline 2024. `pretty` is a progressive enhancement: it is supported in Chrome and Safari but not yet in Firefox, so the layout must hold without it (<https://developer.mozilla.org/en-US/docs/Web/CSS/text-wrap-style>).
- `font-variant-numeric: tabular-nums` for counters, timers, prices, and table columns, so changing digits do not shift the layout.

## Motion

- Use CSS transitions for state changes because they retarget when the user changes intent mid-motion. Use keyframes for staged one-shot entrances.
- List the properties: `transition-property: transform, background-color, box-shadow`. `transition: all` animates properties you did not mean to, and costs layout.
- Make exits shorter and quieter than entrances, often about 150 ms.
- Give press feedback a small `scale` (about 0.96 to 0.98), and drop it for users who prefer reduced motion.
- Use `will-change` only for a measured first-frame stutter, on `transform`, `opacity`, or `filter`.

## Hit areas

Meet the 24 by 24 CSS px WCAG 2.2 minimum, and aim for about 44 by 44 on primary and touch controls. Expand a small icon's hit area with padding or a pseudo-element, and keep expanded areas from overlapping neighbors.

## Review output

| Principle | Before | After |
| --- | --- | --- |
| Concentric radius | Same radius on parent and child | Parent radius includes the padding |
| Tabular numbers | Counter shifts as digits change | Counter uses `tabular-nums` |
| Transition scope | `transition: all` | Explicit property list |

Include the file and property when it is not obvious from the snippet.
