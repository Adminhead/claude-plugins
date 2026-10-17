# Motion in React

Read this when adding or fixing animation in React code. For the design rules (when to animate, durations, easing), see `web-design`, if installed (its motion section). Check the installed version first: Motion for React is published as `motion` (import from `motion/react`), and the older `framer-motion` package has the same API under its own name. Don't mix the two in one tree, and follow the one the repo already uses.

## Presence and layout

- Exit animations need three things together. `AnimatePresence` wraps the conditional, the direct child has a stable `key`, and that child has an `exit` prop. Missing any one makes the exit silently not play.
- `AnimatePresence mode` takes `sync` (default, enter and exit overlap), `wait` (the exit finishes before the enter starts), or `popLayout` (the exiting element leaves layout so siblings reflow). Use `wait` for page or content swaps and `popLayout` for items removed from a list.
- With `popLayout`, a custom child component must forward the `ref` to the DOM node it renders. Motion's docs describe this with `forwardRef`. React 19 passes `ref` as a prop to function components, so a ref prop that reaches the DOM node works there. Check your React version.
- `initial={false}` on `AnimatePresence` skips the enter animation for children present on first render.
- `layout` animates an element's own size or position change. `layoutId` links two separate elements and animates between them. Put `layout="position"` on text inside a resizing container so the text does not stretch. Keep `layout` off large subtrees, and use explicit transforms there.

## Performance and values

- Animate `transform` and `opacity`. They run on the compositor, while `width`, `height`, `top`, and `margin` force layout. Use the `layout` prop when size changes are the point.
- Create motion values with `useMotionValue` and derive with `useTransform`. They update the DOM without re-rendering the component. Do not store a per-frame value in `useState`.
- Pause infinite animations when the tab is hidden (`document.visibilityState`). Background tabs should not burn CPU.
- Keep the first server render and the first client render identical. If the server output has `opacity: 1`, `initial` must match it.
- Motion components need a Client Component boundary in an RSC framework.

## Reduced motion

- Wrap the app in `<MotionConfig reducedMotion="user">`. Motion then drops transform and layout animations when the OS asks for reduced motion and still animates `opacity` and color.
- Use `useReducedMotion()` when one component needs its own fallback, such as swapping a slide for a short fade. Keep fades short.
- The CSS equivalent is `@media (prefers-reduced-motion: reduce)`. Prefer it over a hook that starts `false` and flips after mount, which flashes the full animation on first paint.

Source: <https://motion.dev/docs/react-animate-presence>, <https://motion.dev/docs/react-accessibility>, <https://motion.dev/docs/react-upgrade-guide>.

## GSAP

GSAP is under its own license (free for commercial use, with a carve-out for tools that compete with Webflow's visual animation builder), not MIT. Read the current terms at <https://gsap.com/community/standard-license/> before adding it. For React integration, use the `useGSAP` hook from `@gsap/react`. It cleans up through `gsap.context()`, takes a `scope` ref for selectors, and needs `contextSafe()` around handlers that create animations after the hook runs. Details are at <https://gsap.com/resources/React/>. This skill does not carry GSAP recipes.
