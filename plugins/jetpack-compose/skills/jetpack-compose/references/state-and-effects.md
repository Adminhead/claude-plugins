# State and effects

Read when deciding where state lives, which effect to use, or why an effect restarts. Adapted from chrisbanes/skills (Apache-2.0).

## Contents
- Owners
- Local state
- Effects
- Screen boundary

## Owners

Place each value at its lowest necessary owner.

| Situation | Owner |
|---|---|
| One composable owns simple UI state | Local `remember` / `rememberSaveable` |
| Siblings or a parent share it | Lowest common composable |
| Related UI mechanics need named operations | Plain state holder class, remembered in composition |
| Repository calls, persistence, business rules | Screen-level holder such as a `ViewModel` |

Keep a lone boolean or text field local. Do not split a tiny composable that already takes plain values and callbacks. If UI input drives repository-backed data, keep that input with the holder that produces the data.

## Local state

- `remember { mutableStateOf(...) }` for a value; `rememberSaveable` when recreation must preserve it. Save only serializable values (or use a `Saver`), never runtime objects or callbacks.
- `mutableStateListOf` / `mutableStateMapOf` for in-place changes; with `mutableStateOf(List)` replace the list.
- Derived read-only data: `remember(keys) { ... }`. Never write snapshot state from the composable body to rebuild derived data; events and effects own mutations.

```kotlin
@Composable
fun Counter() {
    var count by remember { mutableStateOf(0) }
    Button(onClick = { count++ }) { Text("$count") }
}
```

## Effects

| Need | API |
|---|---|
| Publish Compose state after a successful recomposition | `SideEffect` |
| Register and unregister a listener or resource | `DisposableEffect(keys)` with `onDispose` |
| Suspending or keyed work | `LaunchedEffect(keys)` |
| Suspend work caused by a user event | `rememberCoroutineScope()` |
| Turn snapshot reads into a Flow | `snapshotFlow { ... }` collected in a `LaunchedEffect` |

- Key an effect by the semantic input that should restart or dispose it. Do not use `Unit` to hide a changing identity, or a whole state object when one property owns the lifecycle. A `LaunchedEffect` that restarts on every keystroke is keyed by the text itself; key it by what the work depends on, or use `snapshotFlow` with `debounce`.
- A long-lived effect that needs the latest callback without restarting reads a `rememberUpdatedState` value lazily inside the effect:

```kotlin
val latestOnTimeout by rememberUpdatedState(onTimeout)
LaunchedEffect(Unit) {
    delay(1_000)
    latestOnTimeout()
}
```

- Do not read that value eagerly inside `remember { }`; it snapshots the initial value. Do not use `rememberUpdatedState(userId)` to avoid restarting a collection that should follow `userId`.
- Collect one-shot event flows (navigation, snackbar, analytics) in `LaunchedEffect`. Collect render state with `collectAsStateWithLifecycle()` near the holder and render it as plain state.
- `SideEffect` runs after every successful recomposition; use a keyed `LaunchedEffect` for one-shot work.
- Frame-clock work such as scrolling or drawer animation runs in a composition-scoped coroutine, not `viewModelScope`.

## Screen boundary

A screen is three seams: small wiring owns app dependencies, durable data and effects; composition or a plain UI state holder owns runtime UI objects (`LazyListState`, `FocusRequester`); a plain content composable receives immutable state and callbacks. The content creates its own runtime objects or takes remembered defaults, so sample state alone renders it.

```kotlin
@Composable
fun ProfileScreen(viewModel: ProfileViewModel, modifier: Modifier = Modifier) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    ProfileContent(
        state = state,
        onNameChange = viewModel::onNameChange,
        onSaveClick = viewModel::save,
        modifier = modifier,
    )
}
```

ViewModel design, `SavedStateHandle` and process death belong to `android`.
