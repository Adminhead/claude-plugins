---
name: react
description: "React component work: boundaries, props vs local state, derived values, effects, keys, render purity, Server Component and Action boundaries, component-level accessibility, measured performance, motion, React 19 upgrades, and focused component tests. Use when adding, changing, reviewing, or debugging React UI behavior (stale state, effect loops, lost state, re-render cost, hydration mismatches). Not for visual design direction (efficient:web-design), JS/TS language issues (efficient:javascript, efficient:typescript), Vite configuration (efficient:vite), Vue component work (efficient:vue), or TanStack routing/data APIs (efficient:tanstack)."
---

# Efficient React

This skill owns component composition and local UI behavior. It does not own visual direction (`efficient:web-design`), language-level concerns (`efficient:javascript`, `efficient:typescript`), bundler configuration (`efficient:vite`), or routing and server state (`efficient:tanstack` when the project uses TanStack; otherwise follow the installed library's conventions).

## Before editing

- Read the affected component, its callers, nearby tests, `package.json`, the lockfile, and build config. Note the installed React and framework versions.
- Look up version-sensitive APIs through Context7 (`resolve-library-id`, then `query-docs`) before using them. Examples include Server Components, Actions, `use`, `useEffectEvent`, the React Compiler, and framework-specific data APIs. Do not assume an API exists in the installed version.
- List the visible states, user actions, props in, callbacks out, and error and recovery behavior. Note whether rendering crosses a server/client boundary.
- Do not invent tokens, copy, routes, data contracts, or dependencies inside a component. Send those decisions back to their owner.

## State ownership

Classify each value as one of these:

- a prop
- local UI state
- a value derived during render
- shared UI state
- remote or server state

Then place it:

- Keep local state in the component that owns the interaction. Lift it only to the nearest parent that must coordinate it.
- Derive values from props and state during render. Do not store a second copy for convenience.
- Use context only for a stable cross-tree concern with several real consumers. Don't use it to avoid passing a few props, or to broadcast fast-changing state across unrelated subtrees.
- Model explicit transitions (a reducer or state machine) only when the interaction really has coordinated multi-step transitions.

## Component contract

- Name the component for its user-facing job. Keep the prop surface small: required data, optional variation, and events.
- Prefer composition (children, slots) when callers need to arrange content. Otherwise write one direct component.
- Give stateful list items a stable domain key. Never use the index when items can be inserted, removed, reordered, or hold local state.
- Extract a child or custom hook only when it has its own understandable contract, real reuse, or isolates a browser or external-system concern.
- If a touched abstraction forces unrelated flags or duplicated state, make the smallest behavior-preserving simplification. Don't rewrite the component library.

## Render purity and updates

- Rendering computes UI from inputs. Never mutate props, shared objects, the DOM, storage, or external systems during render.
- Use functional updaters (`setX(prev => …)`) when the next value depends on the previous one. Don't rely on render count, timing, or order. StrictMode double-invokes render to expose exactly these bugs.
- Keep urgent input feedback separate from expensive deferrable work (`useTransition`, `useDeferredValue`) only when users can see lag. Never defer a value that must stay synchronous for correctness.
- Place Suspense and error boundaries where the wait or failure should be contained, not around the whole page by default. Give each fallback a useful next action.
- For hydration mismatches, repeated renders, lost state, or stale results, reduce the problem to deterministic inputs. Check keys, state ownership, render-time mutation, and server/client-dependent values such as `Date.now()`, `window`, and locale. Never suppress the warning or add a delay as the fix.
- When the code uses `"use server"`, `"use client"`, `useActionState`, `useOptimistic`, or `useSyncExternalStore`, read [references/react-server-and-forms.md](references/react-server-and-forms.md). It covers server/client boundaries, authorizing every Server Function, and `cache`.

## Effects

Use an effect only to synchronize with an external system, such as subscriptions, imperative browser APIs, timers, or a non-React widget. Put work caused by a user action in the event handler.

- Name the external system and the value that drives synchronization before writing the effect.
- Include every reactive value the effect reads in its dependencies. Return cleanup that undoes subscriptions, listeners, timers, requests, and imperative setup.
- Give each effect one synchronization job. If dependencies cause a loop, don't remove dependencies. List what the effect reads and writes, then remove the derived state, move the work to a handler, or split the effect.
- Make async completion safe when inputs change or the component unmounts. Abort the request, or ignore results that are no longer current. Keep error semantics intact.

## Accessibility at the component boundary

- Start with semantic HTML and native controls. Every interactive control needs an accessible name, every form control a label, and every informative image alt text. Add ARIA only where native semantics can't express the behavior.
- Keep DOM, reading, and focus order aligned. Don't add key handlers that duplicate native activation.
- Read [references/component-accessibility-patterns.md](references/component-accessibility-patterns.md) when building or reviewing a custom control. It lists anti-patterns and short fixes for icon buttons, disclosures, and field errors.
- Treat dynamic errors, status messages, dialogs, menus, and focus movement as one contract. That contract covers role, state, announcement, and focus restoration, including disabled, loading, invalid, and recovery states.
- Implement the accepted responsive rules without choosing new visual direction. Check reflow at narrow widths, 200% text, visible focus, contrast, keyboard operation, and target size.

## Files and scope

- Follow the repo's existing layout for co-locating the component, styles, test, and helpers. Keep feature components inside their feature. Add shared primitives only when several confirmed consumers need the same contract.
- Keep behavior changes separate from refactors, migrations, and upgrades unless they are inseparable.
- For animation work, read [references/motion.md](references/motion.md). It covers Motion for React, reduced motion, and where GSAP's license stands.
- Read [references/component-api.md](references/component-api.md) when designing a reusable component's props (controlled and uncontrolled state, an `as` prop, compound parts).
- Read [references/react-19-upgrade.md](references/react-19-upgrade.md) when upgrading from React 18 or fixing a removed-API error. StrictMode still double-invokes effects in React 19, so don't lower effect-count assertions on that basis.

## Performance

1. Start from a reproducible symptom such as slow input, an expensive update, layout shift, or bundle size.
2. Record a baseline with React DevTools Profiler, browser performance tools, or the build report.
3. Remove unnecessary work first. Common causes are misplaced state, repeated synchronization, and needless re-renders.
4. Add `memo`/`useMemo`/`useCallback`, deferral, code splitting, or virtualization only when measurement shows a gain and the invalidation stays correct. If the React Compiler is enabled, manual memoization is usually redundant.
5. Change one cause at a time and remeasure the same interaction. If the symptom won't reproduce, make no optimization claim.
6. After a profile names the cost, read [references/react-performance-catalog.md](references/react-performance-catalog.md) for the matching category (waterfalls, bundle, re-renders, rendering). It is a menu for a measured problem, not a checklist to apply by default.

## Tests and checks

- Add the smallest test that proves the changed behavior. Render with only the providers production needs, act through accessible controls, and assert visible output, accessible state, or an observable callback.
- Read [references/react-component-testing.md](references/react-component-testing.md) when writing or revising a component test. It covers query priority, interaction helpers, network mocking, providers, DOM vs. browser environment, an axe smoke test, boundary tests, and `renderHook`.
- Use a real browser check (`playwright-cli:playwright-cli` if installed, the claude-in-chrome skill, or `efficient:e2e-testing`) when layout, focus, scrolling, CSS, browser APIs, or hydration matter. A DOM-only test is not evidence for those.
- Run the narrowest formatter, typecheck, lint, and targeted test that reach the change. Don't install a runner or test library just for this.
- When a check fails, classify it before fixing. It is a product defect, a wrong expectation, a test-setup problem, a build issue, or an environment gap.

## Report

Cover the changed component boundaries, where each piece of state lives, any effect and the external system it syncs, accessibility states checked, and performance numbers before and after when optimization was the request.

Stop when the requested behavior has direct evidence. Don't turn a local UI change into a new state architecture, redesign, routing change, or performance project.
