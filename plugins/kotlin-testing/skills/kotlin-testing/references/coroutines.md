# Testing coroutines

Based on the kotlinx-coroutines-test README and API docs, checked 2026-11-01 against 1.11.0.

## runTest and virtual time

`runTest` runs its body in a `TestScope` whose `delay` calls are skipped on a virtual clock (`testScheduler`, `currentTime`). It waits for the body and for every child coroutine launched from it, then rethrows uncaught child exceptions.

```kotlin
@Test
fun `retries after the backoff`() = runTest {
    val api = FlakyApi(failures = 2)
    val client = RetryingClient(api, backoff = 1.seconds)

    val result = client.fetch()

    assertEquals("ok", result)
    assertEquals(2_000, currentTime) // two virtual one-second delays, no real wait
}
```

Use the expression form (`= runTest { }`), not `runBlocking { }` around it. Raise the 60 second real-time limit with `runTest(timeout = 2.minutes)` only for a test that really does real work.

## Which test dispatcher

| Dispatcher | Behavior | Use when |
| --- | --- | --- |
| `StandardTestDispatcher` (default in `runTest`) | `launch` only queues; work runs when the test body suspends or calls `runCurrent`, `advanceUntilIdle`, `advanceTimeBy` | you want to control ordering and assert intermediate states |
| `UnconfinedTestDispatcher` | `launch` runs eagerly until its first suspension; `delay` is still virtual | you only assert end states, or a collector must be subscribed before the next line |

Create extra dispatchers on the same scheduler, otherwise they run on their own clock: `StandardTestDispatcher(testScheduler)`. Inside `runTest`, `testScheduler` is the scope's scheduler. Outside it (in a rule), build one scheduler and share it.

## Moving time

- `runCurrent()` runs tasks due at the current virtual time.
- `advanceTimeBy(d)` runs tasks due strictly before `currentTime + d`; a task due at exactly that instant has not run. Follow it with `runCurrent()` to run the boundary.
- `advanceUntilIdle()` runs everything queued, including all pending delays. It never helps with a loop that reschedules itself forever (`while (true) { delay(1000) }`); cancel that scope or put it in `backgroundScope`.

```kotlin
@Test
fun `polls every 30 seconds`() = runTest {
    var polls = 0
    Poller(scope = backgroundScope, period = 30.seconds) { polls++ }.start()

    runCurrent()
    assertEquals(1, polls)            // first poll at t=0
    advanceTimeBy(30.seconds)
    runCurrent()
    assertEquals(2, polls)            // the poll due at exactly t=30s needed runCurrent
}
```

## Inject dispatchers and scopes

```kotlin
class Syncer(
    private val api: Api,
    private val scope: CoroutineScope,
    private val io: CoroutineDispatcher = Dispatchers.IO,
)

@Test
fun `syncs`() = runTest {
    val syncer = Syncer(FakeApi(), backgroundScope, StandardTestDispatcher(testScheduler))
    // ...
}
```

A hard-coded `withContext(Dispatchers.IO)` runs on a real thread. `runTest` still waits for it, but `delay` inside it is real. Replace the dispatcher with an injected one rather than waiting.

## backgroundScope

Coroutines launched in `backgroundScope` are cancelled when the test body ends and are not waited for. Put there: an infinite collector, a poller, a `stateIn`/`shareIn` sharing scope, a class's own `CoroutineScope` parameter. Never put in it work the test must see complete: a failure inside is reported, but `runTest` will not wait for it.

## UncompletedCoroutinesError

`After waiting for 1m, the test coroutine is not completing, there were active child jobs: [...]` means the body or one of its children never finished within 60 real seconds. The message lists the unfinished jobs; read them first. Causes:

1. A collector or loop started with `launch { flow.collect { } }` in the test scope. Move it to `backgroundScope`, or cancel the returned job.
2. Something awaits a signal nothing sends: a `CompletableDeferred` never completed, a `Channel.receive()` with no `send`, a `first()` on an empty flow.
3. Real-thread work. A production `Dispatchers.IO/Default` or `Thread` pool that blocks or never finishes. Inject the dispatcher.
4. A virtual-time loop: `while (true) { delay(...) }` plus `advanceUntilIdle()`.
5. A class under test creates its own `CoroutineScope(...)` and the test never cancels it. Pass the scope in and give it `backgroundScope`.
6. `runBlocking` or `Thread.sleep` inside the test body blocks the single test thread so the scheduler cannot run.

## The Main dispatcher

Code on `Dispatchers.Main` (including an Android `viewModelScope`) fails in a JVM test with `Module with the Main dispatcher is missing`. Add `kotlinx-coroutines-test` as a test dependency and install a test dispatcher before the object under test is created; reset it afterward. A `TestDispatcher` passed to `setMain` donates its scheduler to every `runTest` that follows, so one clock covers the whole test.

JUnit 4 rule:

```kotlin
class MainDispatcherRule(
    private val dispatcher: TestDispatcher = UnconfinedTestDispatcher(),
) : TestWatcher() {
    override fun starting(description: Description) = Dispatchers.setMain(dispatcher)
    override fun finished(description: Description) = Dispatchers.resetMain()
}

class OrderViewModelTest {
    @get:Rule val main = MainDispatcherRule()
    // ...
}
```

Jupiter and `kotlin.test`: do the same in `@BeforeEach`/`@AfterEach` (or `@BeforeTest`/`@AfterTest`), or write a `BeforeEachCallback`/`AfterEachCallback` extension. Kotest: `beforeTest { Dispatchers.setMain(d) }` and `afterTest { Dispatchers.resetMain() }`. Add `@OptIn(ExperimentalCoroutinesApi::class)` if the compiler asks.

Pick the default by what the test asserts. `UnconfinedTestDispatcher` makes `viewModelScope.launch` run immediately, so state is final after the call. Use `StandardTestDispatcher()` (and pass `main.dispatcher` or `testScheduler` along) to assert the loading state before the work runs; then call `runCurrent()`/`advanceUntilIdle()`.

## Time-based operators and timeouts

`withTimeout` and `debounce` follow virtual time in `runTest`, so a `withTimeout(1_000)` over a 2-second delay throws immediately in real time. Test them with `advanceTimeBy` plus `runCurrent`, never by sleeping. See [flow.md](flow.md) for a `debounce` example.

## Exceptions

An exception thrown by a child launched in the test scope is rethrown when the test body ends. To assert on it, wrap the whole `runTest` in `assertFailsWith`, or catch it inside the code under test and assert the resulting state. `CancellationException` is not a failure; do not assert on it as one.
