# Rendered review checklist

Read this when reviewing a running UI, before reporting findings in section 8 of the skill. It is a menu of defects to look for, so skip the items the surface does not have. Drive the page with the Playwright MCP (efficient-web), `playwright-cli:playwright-cli` (if installed), or the claude-in-chrome skill (if available), and judge it against the product's documented system.

## Loop

1. Capture a before screenshot of the affected state and width.
2. Fix one issue, then reload (or wait for HMR) and capture again.
3. Check that the neighbors did not regress.
4. After three failed attempts on one issue, stop and ask the user. Report the evidence and what you tried.

## Layout

- No unintended horizontal scrollbar, and no content spilling out of its parent. Find the widest element and fix it. Do not add `overflow-x: hidden` to hide the symptom.
- No text hidden under a sticky bar or an absolutely positioned layer.
- No clipping container (`overflow: hidden` or `clip`) around a popover, menu, or tooltip that must escape it.
- Tables, code blocks, and wide media scroll or reflow inside their own container.
- Scrollers and carousels keep matching gutters on both edges.
- Multi-column rows stay balanced, without one column running far past its neighbor.
- Headings have more space above than below, so each reads as attached to its own content.
- Bordered or colored containers have padding of at least 8 px (12 to 16 is better), and body text never touches the viewport edge.
- Alignment holds for grid items, form labels and inputs, and icons beside text.

## Responsive

- Walk widths from 320 CSS px up to a wide window, and resize continuously to find the widths where the layout breaks. Set a breakpoint where content breaks, not at a device width.
- At 200% text zoom, nothing is lost or forces two-dimensional scrolling.
- Touch targets meet 24 by 24 CSS px, and larger for primary actions.

## Typography

- Body text of at least 16 px, a line height of about 1.5, and lines of about 40 to 80 characters.
- Long words, URLs, and code wrap or scroll without clipping.
- Web fonts load without a visible jump. Check the fallback font's metrics, and reserve space so the swap does not shift layout.

## Color and states

- Text contrast of at least 4.5:1 (3:1 for large text), and 3:1 for control borders, icons, and focus indicators, measured in the real context.
- Status is conveyed by more than color.
- Each interactive element shows default, hover (pointer only), focus, active, disabled, and loading where they apply.

## Media

- Images keep their aspect ratio, have dimensions that prevent layout shift, and show a sensible state when they fail to load.
- Embedded video and iframes stay inside their container.

## Keyboard and accessibility

- Tab order follows reading order, focus is always visible, and a skip link exists on pages with repeated navigation.
- Dialogs trap focus, close on Escape, and return focus to the trigger.
- Images have alt text, controls have names, and heading levels run in order.
- Animations respect `prefers-reduced-motion`.

## Build correctness

Check these before judging the design, because they are defects, not taste.

- No uncaught script errors on load. Fix a broken interaction caused by a JS error first.
- Content is visible at rest. If an entrance animation is used, ship the content visible by default and enhance it, so a missing handler never leaves it at `opacity: 0`.

## Severity

| Level | Meaning | Example |
| --- | --- | --- |
| P0 | Breaks the task | Content missing, controls overlap |
| P1 | Serious usability | Unreadable text, a button that does not work |
| P2 | Moderate | Alignment or spacing inconsistency |
| P3 | Minor | Slight offsets, small color variation |
