# Component APIs

Read when designing a reusable composable or fixing a modifier or slot problem. Adapted from chrisbanes/skills (Apache-2.0).

## Modifier

- A composable that emits layout declares `modifier: Modifier = Modifier` after the required parameters and applies it to the root layout. The parent owns placement (padding, alignment, general size); the component owns its invariant structure.
- Put the caller modifier first in the root chain, then append intrinsic modifiers. A modifier applied only to a child does not make the root placeable.
- When `if` branches emit different root layouts, apply `modifier` to each branch root. Do not merge them into a wrapper.
- Order matters: `padding` before `background` pads outside the color, after it pads inside; `clickable` before `padding` makes the padding tappable. A modifier that seems ignored is usually overridden by constraints set earlier in the chain.
- Build one fluent chain, one call per line from three calls up. Conditional segments: `.then(if (selected) Modifier.background(Color.Red) else Modifier)`.
- Skip the parameter on previews, test fixtures and non-layout `@ReadOnlyComposable` accessors.

```kotlin
@Composable
fun Avatar(url: String, modifier: Modifier = Modifier) {
    Image(
        painter = rememberAsyncImagePainter(url),
        contentDescription = null,
        modifier = modifier
            .clip(CircleShape)
            .size(48.dp),
    )
}
```

`clip` and a default size can be intrinsic; `fillMaxWidth`, screen padding and alignment are the caller's.

## Slots

- Replace unconstrained primitive content and boolean shape flags (`showIcon`, `isCompact`, `hasSubtitle`) with named `@Composable` slots. Keep primitives for semantic or design-system values such as `checked`.
- An optional slot is nullable with a `null` default, so its container and spacing disappear.
- Name free-form slots `xxxContent`; keep one convention per component. Add a `RowScope`/`ColumnScope`/`BoxScope` receiver only when the caller's control of that region's layout is part of the public contract (a top bar's `actions`).
- Put repeated defaults and tokens in an `XxxDefaults` object.
- A single-use helper keeps primitive parameters; do not add slots for hypothetical flexibility.

```kotlin
@Composable
fun SettingsRow(
    headlineContent: @Composable () -> Unit,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    supportingContent: (@Composable () -> Unit)? = null,
    leadingContent: (@Composable () -> Unit)? = null,
    trailingContent: (@Composable () -> Unit)? = null,
) { /* component-owned structure */ }
```
