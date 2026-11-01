# Testing Flow, StateFlow, SharedFlow and Channel events

Adapted from ECC `kotlin-coroutines-flows` (testing section, MIT) and chrisbanes `flow-state-events.md` (Apache-2.0), rewritten against the kotlinx-coroutines-test and Turbine docs, 2026-11-01. Turbine 1.2.1.

## What the primitive delivers decides the test

Before asserting, state the primitive's contract. It determines which events a test can see at all.

| Primitive | A test collector sees |
| --- | --- |
| cold `Flow` | everything, from the start, for each collection |
| `StateFlow` | the current value first, then each later value; **equal consecutive values and fast intermediate values are conflated** |
| `SharedFlow(replay = 0)` | only events emitted after it subscribed; an emit with no collector is lost |
| `Channel` via `receiveAsFlow()` | each event once, to one collector, buffered until collected |

Therefore: subscribe first, trigger second. A test that emits (or calls the ViewModel function) before `test { }` or before the collector starts will miss the event on a replay-0 flow. That is a defect in the test, and also a signal about the production type: if an event must survive an absent collector, it should be a buffered `Channel` or durable state.

## Turbine

```kotlin
@Test
fun `search shows loading then results`() = runTest {
    val viewModel = SearchViewModel(FakeSearchRepository(results = listOf("a")))

    viewModel.state.test {
        assertEquals(SearchState.Idle, awaitItem())      // StateFlow: current value first
        viewModel.onQuery("a")
        assertEquals(SearchState.Loading, awaitItem())   // needs a Standard dispatcher to be observable
        assertEquals(SearchState.Loaded(listOf("a")), awaitItem())
    }
}
```

- `awaitItem()`, `awaitComplete()`, `awaitError()`, `expectNoEvents()`, `skipItems(n)`, `cancelAndIgnoreRemainingEvents()`.
- At the end of `test { }` Turbine fails on any unconsumed event. Consume them, or end with `cancelAndIgnoreRemainingEvents()`. Do not hide a surprise item with `cancelAndIgnore...` by habit.
- The `await*` timeout is wall-clock (default 3 seconds), so a flow that really needs a long real wait must pass `test(timeout = ...)`. Virtual `delay` inside the flow is fine.
- With `UnconfinedTestDispatcher` as Main, `Loading` can already be replaced by `Loaded` before the collector reads it; a `StateFlow` collector then sees only `Idle` and `Loaded`. Assert the states the contract guarantees, or use a Standard main dispatcher.
- Several flows: `turbineScope { val a = flowA.testIn(backgroundScope); val b = flowB.testIn(backgroundScope); ... }`.
- One-shot events: `viewModel.events.test { viewModel.onSave(); assertEquals(Event.Saved, awaitItem()) }`. For a `Channel`-backed `receiveAsFlow()`, an event sent before `test { }` is still buffered and will arrive.
- Don't use Turbine for a cold flow you can read with `toList()`/`first()`:

```kotlin
assertEquals(listOf(1, 2, 3), repository.observe().take(3).toList())
```

## Without Turbine: collect in backgroundScope

```kotlin
@Test
fun `debounces rapid queries`() = runTest {
    val queries = MutableSharedFlow<String>()
    val seen = mutableListOf<String>()
    backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) {
        queries.debounce(300.milliseconds).toList(seen)
    }
    runCurrent()               // collector is subscribed before anything is emitted

    queries.emit("a")
    advanceTimeBy(100.milliseconds)
    queries.emit("ab")
    advanceTimeBy(300.milliseconds)
    runCurrent()               // run the task due at exactly t+300ms

    assertEquals(listOf("ab"), seen)
}
```

Two rules: the collector lives in `backgroundScope` because it never completes, and it uses a dispatcher built from `testScheduler` so `debounce` sees virtual time.

## Faking a flow dependency

```kotlin
class FakeItemRepository : ItemRepository {
    private val items = MutableStateFlow<List<Item>>(emptyList())
    override fun observeItems(): Flow<List<Item>> = items
    fun emit(value: List<Item>) { items.value = value }
}
```

Use `MutableStateFlow` for a repository that has a current value, `MutableSharedFlow(replay = 1)` when "no value yet" is real, and `flow { emit(...); throw IOException() }` to exercise the error path. Drive the fake from the test and let the real consumer react; do not mock `Flow`.

## stateIn and shareIn

A `stateIn(scope, SharingStarted.WhileSubscribed(5_000), initial)` property only runs while something collects it. In a test, either collect it (Turbine or `backgroundScope.launch { state.collect {} }`) or you read only the initial value. `advanceTimeBy(5_000)` after the last collector is cancelled shows the upstream stopping. `SharingStarted.Eagerly` starts at construction; give it `backgroundScope`.

## State updates

If the code under test uses `MutableStateFlow.update { }`, assert the resulting state, not the number of emissions: conflation makes the count timing-dependent. Assert intermediate states only when a test dispatcher guarantees them.
