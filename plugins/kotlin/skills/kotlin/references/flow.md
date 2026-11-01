# Flow: cold, hot, state and events

Read when choosing between `Flow`, `StateFlow`, `SharedFlow` and `Channel`, when events go missing, or when `stateIn` misbehaves. Verified 2026-11-01 against kotlinx-coroutines 1.11.

## Choose the primitive from the contract

| Need | Primitive |
|---|---|
| Independent stream per collector | Cold `Flow` |
| Current, renderable state with synchronous `.value` | `StateFlow` |
| Broadcast to every active collector, no `.value` | Deliberately configured `SharedFlow` |
| Each event handled once by one consumer, kept until it arrives | `Channel(Channel.BUFFERED)` exposed with `receiveAsFlow()` |

Ask two questions before choosing an event type: may an absent collector lose the event, and must every observer see it? If every observer must see it, or it must survive a missing collector, model it as durable state the consumer clears (`pendingNavigation: Route?` plus `onNavigated()`), not as an event.

```kotlin
private val navigation = Channel<Navigation>(Channel.BUFFERED)
val navigationEvents: Flow<Navigation> = navigation.receiveAsFlow()
```

## How each one loses events

| Type | Loss |
|---|---|
| `MutableSharedFlow()` (replay 0) | `emit` with no collector returns at once and the event is dropped; so is one emitted between a collector leaving and the next one starting |
| `MutableSharedFlow(replay = 1)` | Replays a stale event to every new collector, such as after rotation |
| `Channel` | One collector gets each event; two collectors split them. `trySend` on a full bounded channel fails; `send` suspends. A collector cancelled while handling an event can lose it |
| `StateFlow` | Equal consecutive values are conflated, so repeating the same state or event value emits once |

## State

- `StateFlow` needs an initial value. If absence, loading or error is real, model it (`User?`, a sealed `UiState`, `Result`) instead of a fake `NoUser` or placeholder id.
- Private `MutableStateFlow`, public `asStateFlow()`.
- `update { current -> current.copy(...) }` is atomic and may retry its lambda, so keep it pure and fast; compute I/O results, ids and timestamps before calling it.
- Hold immutable values. `list.add(x)` then re-assigning the same list never emits; use `it.copy(list = it.list + x)`.

```kotlin
val details = Details.from(response)
_state.update { current -> current.copy(details = details) }
```

## Sharing and derived state

- Expose `stateIn` as one property, not a function that starts another sharing coroutine per call.
- `SharingStarted.WhileSubscribed(5_000)` keeps the upstream alive for 5 seconds after the last collector, which survives a configuration change on Android without restarting the upstream. Until a collector arrives, `.value` is the initial value.
- `Eagerly` when `.value` must be fresh with no collector; `Lazily` to start at the first collector and never stop.
- `map` on a `StateFlow` returns a plain `Flow`. Finish with `stateIn` when callers need `.value`.

```kotlin
val name: StateFlow<String> = userState
    .map { it.name }
    .stateIn(viewModelScope, SharingStarted.Eagerly, userState.value.name)
```

## Operators and errors

- `flowOn(dispatcher)` changes the upstream context only. The collector runs in the caller's context; `flowOn(Dispatchers.Main)` does not move collection.
- `catch { }` sees upstream exceptions only; it does not catch an exception thrown in `collect`. Rethrow `CancellationException`, and put `catch` before the terminal operator.
- `debounce` then `distinctUntilChanged` then `mapLatest` (or `flatMapLatest`) for search-as-you-type; `mapLatest` cancels the in-flight lookup.
- `retryWhen { cause, attempt -> cause is IOException && attempt < 3 }` with a `delay` for backoff; never retry on `CancellationException`.
- `combine` for the latest of several flows; `zip` pairs by position.
- Do not create a `Flow` inside a composable without `remember`, and do not collect in `init {}` without a launch in an owner scope.

## Tests

Flow tests (`runTest`, Turbine, virtual time) belong to `kotlin-testing`.
