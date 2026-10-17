# React performance catalog

Read this after a profile or build report names the cost, and only for the category that matches. Without a measured symptom, none of these is a reason to change code. If the React Compiler is enabled, skip the memoization items. It handles them.

Adapted from the Vercel Labs `react-best-practices` ruleset (MIT, Vercel Engineering; see the plugin's `LICENSE`). Source: <https://github.com/vercel-labs/agent-skills/tree/main/skills/react-best-practices>.

## Waterfalls (slow first load)

- Check cheap synchronous conditions (props, flags) before awaiting remote data, and move an `await` into the branch that uses its result.
- Run independent awaits together with `Promise.all`. When a result depends on only part of the data, start every promise first and await each one where it is needed.
- In Server Components, sibling awaits inside one component run in sequence. Split them into child components so React fetches them in parallel.
- Put `<Suspense>` close to the slow data so the rest of the page paints. Reserve the fallback's space (skeleton or `min-height`) to avoid layout shift.

## Bundle size (slow first load, large JS)

- Import from the file that defines a symbol, not from an `index` barrel. A barrel makes the bundler and dev server walk every re-export.
- Load heavy, rarely used components with `React.lazy` plus `<Suspense>`, or the framework's dynamic import. Keep import paths statically analyzable (`import("./pages/home")`, not a template string).
- Start the import or `<link rel="preload">` on hover or focus so the chunk is cached by the click.
- Load analytics and support widgets after hydration, not in the critical path.
- Framework-specific tools such as Next.js `optimizePackageImports` automate the barrel rule for listed packages. Check the framework docs before relying on them.

## Re-renders (slow input, slow updates)

- Never define a component inside another component. The inner type is new on every render, so React unmounts and remounts its subtree.
- Subscribe to the smallest value. A selector that returns `cart.length > 0` re-renders when emptiness flips, while one that returns `cart` re-renders on every change. Read a store value in a handler at call time when the render does not need it.
- Hoist a constant default for a non-primitive prop (`items ?? EMPTY`) when the child is memoized, because a fresh `[]` defeats `memo`.
- Depend on primitives (`[id, name]`), not on object literals, in effect and memo dependency lists.
- Initialize expensive state lazily: `useState(() => parse(input))`.
- Render conditionals with a ternary when the left side can be `0`: `count > 0 ? <Badge/> : null`. `count && <Badge/>` renders the text `0`.
- Move work caused by a user action into the handler instead of an effect that watches state.
- Keep a value that changes often but is not displayed (last key, timestamp) in a ref.

## Rendering cost (long lists, off-screen content)

- `content-visibility: auto` with `contain-intrinsic-size` lets the browser skip rendering rows that are off screen. Measure scroll position and find-in-page behavior before keeping it.
- `<Activity mode="hidden">` (stable since React 19.2) keeps a subtree's state and DOM but unmounts its effects, and re-creates them on `visible`. Use it for tabs and panels whose state should survive. Effects that must keep running while hidden need another design.
- Animate a wrapper `div` with `transform` instead of animating attributes of an SVG inside it.
- Limit `suppressHydrationWarning` to a single leaf node with a known server/client difference, such as a formatted timestamp.
- For values needed before hydration (theme, locale), set them from a small inline script before React mounts.

## Delivery hints

- `react-dom` exposes `preload` and `preconnect` for resource hints from components.
- Use `defer` for ordered scripts and `async` for independent ones.
- Passive scroll listeners (`{ passive: true }`) cannot call `preventDefault`, and they keep scrolling smooth.

## Core Web Vitals mapping

| Metric | Usual cause in React apps |
| --- | --- |
| LCP | Waterfalls, large initial bundle, late resource discovery |
| INP | Re-render cost, long tasks in handlers, heavy effects |
| CLS | Missing image dimensions, Suspense fallbacks without reserved space |

The Core Web Vitals set is LCP, INP, and CLS. FID was retired when INP became stable in 2024 (<https://web.dev/articles/vitals>).
