# Animation

Read when adding motion. Adapted from chrisbanes/skills (Apache-2.0).

Pick the smallest API that expresses the motion and its lifecycle.

| Need | Prefer |
|---|---|
| Show or hide a subtree, with removal after exit | `AnimatedVisibility` |
| One value follows state | `animate*AsState` |
| Several values follow one boolean, enum or sealed state | `rememberTransition` with child animations |
| Child size changes | `Modifier.animateContentSize()` |
| Different composable trees fill one region | `AnimatedContent`, or `Crossfade` for the simple case |
| Drag, fling, interruption, imperative control | `Animatable` |
| Repeating cycle | `rememberInfiniteTransition` |

- Alpha keeps content composed; `AnimatedVisibility` removes it after exit. Do not fake unmounting with a fade.
- Give animations a `label` for tooling. Add an `animationSpec` only when the default motion is wrong.
- Values that must stay in sync live on one transition, not several independent `animate*AsState` calls.

```kotlin
val transition = rememberTransition(targetState = phase, label = "phase")
val alpha by transition.animateFloat(label = "alpha") { if (it == Phase.Visible) 1f else 0f }
val offset by transition.animateDp(label = "offset") { if (it == Phase.Visible) 0.dp else 24.dp }
```

- Animated state that changes every frame is read in a layout or draw block (`graphicsLayer {}`, `offset {}`, `drawBehind`); see [stability.md](stability.md).
- Destination swaps owned by a navigation library use that library's transitions. Art-based motion (Lottie-style) uses a dedicated library.

## AnimatedContent identity

`AnimatedContent` keeps outgoing and incoming content composed together. Render from the content lambda's parameter, not captured outer state, or both branches show the newest value.

```kotlin
// Wrong: both branches read the newest selectedId.
AnimatedContent(targetState = selectedId) { Destination(selectedId) }
// Right
AnimatedContent(targetState = selectedId) { targetId -> Destination(targetId) }
```

For a sealed UI state where a payload refresh should update in place, key by visual shape:

```kotlin
AnimatedContent(
    targetState = state,
    contentKey = { when (it) { is Loading -> "loading"; is Success -> "content"; is Error -> "error" } },
    label = "profile-content",
) { s -> /* render s */ }
```

Without `contentKey`, unequal payloads animate as new content. For swaps between distinct items keep the default identity or a stable item id; a presence key such as `{ it != null }` suppresses the transition between different non-null items.
