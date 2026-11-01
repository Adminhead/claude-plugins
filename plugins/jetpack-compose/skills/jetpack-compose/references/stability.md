# Stability and deferred reads while authoring

Read when writing models passed to composables or when a value changes every frame. Adapted from chrisbanes/skills (Apache-2.0). Verified 2026-11-01 against developer.android.com. Auditing existing code goes to `android-skills:jetpack-compose-performance`.

## Contents
- Compiler mode
- Authoring rules
- Deferred reads
- Lists

## Compiler mode

Strong skipping is on by default from Kotlin 2.0.20 (the Compose compiler ships with Kotlin, applied through the `org.jetbrains.kotlin.plugin.compose` plugin). Restartable composables then skip even with unstable parameters. Stable parameters compare with `equals`, unstable ones by instance identity (`===`). Lambdas are remembered automatically. On older builds, enable it with `enableStrongSkippingMode = true` in the `composeCompiler` block.

Compiler reports (`classes.txt`, `composables.txt`) are a measurement tool: enable them behind a Gradle property, only when investigating.

## Authoring rules

- Pass immutable data: `val` properties of stable types, `kotlinx.collections.immutable` types for UI state lists when identity churn matters, or a data class whose `equals` is cheap.
- A plain `List` parameter is unstable, but with strong skipping it only costs a recomposition when a new instance is created each time. Create the list once at the state producer, not in the composable body.
- Never annotate `@Stable` or `@Immutable` to silence a report. The annotation is a promise; a false one shows stale UI. Make the type immutable or snapshot-observable first, then annotate if still needed.
- A third-party type that is genuinely immutable can go in a `stabilityConfigurationFiles` entry; only add types whose contract you uphold.
- A lambda created per lazy item from changing inputs: `remember(item.id) { { onItemClick(item.id) } }`.
- Do not tune a recomposition count caused by real data change or a correctness bug. Change code for performance only when a measurement shows the cost.

## Deferred reads

State invalidates the phase that reads it. Frame-rate state (scroll, animation, drag) belongs in layout or draw, not composition.

| Composition-time read | Deferred read |
|---|---|
| `Modifier.offset(x = animatedX)` | `Modifier.offset { IntOffset(animatedX.value.roundToPx(), 0) }` |
| `Modifier.graphicsLayer(translationY = y)` | `Modifier.graphicsLayer { translationY = yProvider() }` |
| `Child(scroll = listState.firstVisibleItemScrollOffset)` | `Child(scrollProvider = { listState.firstVisibleItemScrollOffset })` |

- Keep the `State<T>` or a provider lambda across composition and read `.value` inside `offset {}`, `graphicsLayer {}`, `drawBehind`, `drawWithContent` or `layout`.
- Keep a read in composition when it decides which composables exist.
- Use `derivedStateOf` when many input changes yield few output changes (`listState.firstVisibleItemIndex > 0`); not for a cheap expression of a single state.
- Never write snapshot state from a later phase into an earlier one (measured size written into state read in composition); it forces an extra pass. For sibling-row measurement use a measure-phase helper instead.
- An animated fill that updates every frame: `drawBehind { drawRect(color.value) }` rather than `background(color.value)`.

## Lists

- `LazyColumn { items(list, key = { it.id }, contentType = { it.type }) { ... } }`. Without a key, state follows position and reorders lose scroll and item state.
- Keys must be unique and Bundle-saveable (Int, Long, String, Parcelable).
- Hoist state, sorting and formatting out of the item lambda. Do not nest a vertically scrolling lazy list in another with unbounded height.
