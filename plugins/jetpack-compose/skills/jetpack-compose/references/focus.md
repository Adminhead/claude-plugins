# Focus, keyboard and D-pad

Read when a screen must work with a keyboard, D-pad, remote or accessibility focus. Adapted from chrisbanes/skills (Apache-2.0). TV UI proper goes to the `android-skills` TV skills.

Focus is stateful behavior: make targets and exceptional edges explicit, and drive them through the user's input.

| Need | Add |
|---|---|
| Normal button, text field, clickable | Nothing; it is already focusable |
| Programmatic initial or restored focus | `FocusRequester` + `Modifier.focusRequester(...)` |
| Visual or state reaction to focus | `Modifier.onFocusChanged { }` |
| Custom surface that is not focusable | `Modifier.focusable()` plus role and semantics |

- Request focus from a `LaunchedEffect` keyed to the condition that makes the target present, never from the composable body. For lazy content keep requesters by stable item id and request after the item is composed.

```kotlin
LaunchedEffect(items.isNotEmpty()) {
    if (items.isNotEmpty()) firstItemRequester.requestFocus()
}
```

- Keep default spatial search. Encode only the wrong edges with `focusProperties`; many hard-coded links make stale focus graphs.

```kotlin
Modifier.focusProperties {
    up = headerRequester
    left = FocusRequester.Cancel
}
```

- Handle keys only for behavior that is not normal click or traversal, and consume only the handled event.

```kotlin
Modifier.onPreviewKeyEvent { e ->
    if (e.type == KeyEventType.KeyUp && e.key == Key.Back) { onBack(); true } else false
}
```

- After a refresh, restore focus by semantic id when it still exists, otherwise a deterministic fallback.
- Inside `AnimatedContent`, use the content lambda's target for identity, requester ownership and the effect key.
- Throttle rapid D-pad work at the expensive owner, not across the screen.
- Test with a real key interaction (`performKeyInput { pressKey(Key.DirectionDown) }`) and `assertIsFocused()`; the test setup itself belongs to `android-testing`.
