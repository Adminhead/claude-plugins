---
name: jetpack-compose
description: 'Writes everyday Jetpack Compose UI: where state lives and which effect runs which work, reusable component APIs with modifier and slot parameters, LazyColumn keys, avoiding unstable parameters and deferring state reads, Material 3 theming with dynamic color, animation APIs, focus and D-pad handling, semantics and previews. Use for @Composable code, symptoms such as "LaunchedEffect restarts on every keystroke", "state resets on recomposition", a card or button component with many boolean flags, a modifier that gets ignored, or a request to add a screen, theme or animation in Kotlin with Compose.'
---

# Jetpack Compose

Write Composable code that follows the project's existing patterns; the rules below are defaults for new code, not a reason to rewrite working screens.

Not for: edge-to-edge and insets (`android-skills:edge-to-edge`), window sizes and foldables (`android-skills:adaptive`), Navigation 3 and predictive back (`android-skills:navigation-3`, `android-skills:navigation-event`), XML to Compose migration (`android-skills:migrate-xml-views-to-jetpack-compose`), auditing or diagnosing recomposition and jank in existing code (`android-skills:jetpack-compose-performance`), Wear, TV and Glance UI (their `android-skills` skills), ViewModels and data (`android`), UI tests (`android-testing`), visual direction for a new screen (`ui-direction`), and Docker Compose files (`docker`).

## Orient

1. Read the version catalog and module build file: the Compose BOM or compiler plugin, the Kotlin version (strong skipping), Material 2 or 3, and the navigation library in use.
2. Open one existing screen and one shared component. Match their naming, state holder style and theme usage.

## Rules

1. **State.** Give each value one lowest owner. A screen is a small wiring composable (ViewModel, effects) plus a `XxxContent` composable that takes immutable state and callbacks and renders from sample data. Local UI state uses `remember`, or `rememberSaveable` when it must survive recreation. Read [references/state-and-effects.md](references/state-and-effects.md) for hoisting, effects and keys.
2. **Effects.** Composition renders and nothing else. Pick the effect whose lifecycle matches the work and key it by the input that should restart it. Never launch a coroutine or register a listener in the body.
3. **Components.** A composable that emits layout takes `modifier: Modifier = Modifier` after the required parameters and applies it once, first in the root chain. Use `@Composable` slots instead of boolean shape flags. Read [references/components.md](references/components.md).
4. **Lists.** Give `items` a stable `key` (the id, not the index) and a `contentType` when rows differ. Do no sorting, filtering or formatting inside an item lambda; do it once in the state producer or in `remember(keys)`.
5. **Performance while authoring.** Check the Kotlin version first: from 2.0.20 strong skipping is on, so unstable parameters compare by identity and most changes are unnecessary. Defer frame-rate reads into lambda modifiers. Change code for performance only when a measurement shows the cost. Read [references/stability.md](references/stability.md).
6. **Theme.** Take colors, type and shapes from `MaterialTheme`, not literals. Read [references/material3.md](references/material3.md) for theme setup and dynamic color.
7. **Motion.** Choose the smallest animation API that fits. Read [references/animation.md](references/animation.md).
8. **Focus.** Keyboard, D-pad and accessibility focus: read [references/focus.md](references/focus.md).
9. **Semantics.** Interactive custom surfaces need `Modifier.semantics` or `clickable(role = ...)`, and images a `contentDescription` (or `null` when decorative). Tests find nodes through semantics, so stable test tags help.
10. **Previews.** Add `@Preview` only when the module already has preview tooling in its dependencies. Preview the content composable with sample state, never the wiring one.

## Done when

- Every state value has one owner and every effect has a justified key.
- Reusable components accept a modifier and need no flag matrix.
- The screen content composes from sample state alone.
- The module builds (`./gradlew :module:compileDebugKotlin`), plus the project's existing tests for the changed screen.

## Gotchas

- A bare `var` in a composable resets on recomposition and does not invalidate UI; use `remember { mutableStateOf(...) }`.
- `rememberUpdatedState` is for a long-lived effect that needs the latest callback. If a changed value should restart the work, make it a key.
- `mutableStateOf(list)` observes replacement, not in-place mutation; use `mutableStateListOf` or replace the list.
- Navigation Compose 2.x (`NavHost`, `composable(route)`) is fine when the project already uses it; for new Navigation 3 work use `android-skills:navigation-3`.
