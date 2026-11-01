# Coroutines: scope ownership, cancellation, blocking

Read when launching, reviewing or refactoring coroutine code. Verified 2026-11-01 against kotlinx-coroutines 1.11.

## Who owns the work

Name the caller that owns cancellation, completion and failure. If none is visible, do not add a launch.

| Situation | Do |
|---|---|
| Repository, manager, use case or data source needs async work | Expose `suspend`; the caller picks the scope and error handling |
| UI event reaches a state holder | The state holder launches in its lifecycle scope (`viewModelScope`, a component scope) |
| Periodic or deferred work | Schedule from a suspending orchestrator (WorkManager on Android) |
| Synchronous external API with no lifecycle | One named launch site, never a class `init` |
| Lifecycle infrastructure owns cancel, error and restart | May hold a scope, with visible start and stop |

The UI exception needs all three: the class owns UI state, its scope is cancelled with that surface, and the caller is a real UI event. Lower layers stay suspending.

```kotlin
class FavouritesViewModel(private val repository: FavouritesRepository) : ViewModel() {
    fun onToggle(item: Item) {
        viewModelScope.launch { repository.toggle(item) }
    }
}
```

Smells to fix:
- A stored, injected or function-local `CoroutineScope` on a non-UI class. A cancelled stored scope makes later launches silently do nothing.
- `launch` in a constructor or `init`. A constructor may register; start work from a named function.
- `Thread.start` or `executor.submit` whose completion and failure nobody observes. Make the function `suspend` and let the lifecycle owner launch it. An executor that backs a `CoroutineDispatcher` is fine when something closes it.
- An application singleton that launches in the background with no reader able to find who stops it. Invert the observation into a known consumer, or launch one suspending observer from one named orchestrator.

If a suspend API already gives its caller cancellation, result and failure, change nothing; adding a scope or `Deferred` wrapper makes it worse.

## Cancellation

Broad `catch` and `runCatching` match `CancellationException`. Preserve it:

```kotlin
try {
    api.load()
} catch (error: CancellationException) {
    throw error
} catch (error: Exception) {
    logger.warn("load failed", error)
}
```

- `currentCoroutineContext().ensureActive()` (or `ensureActive()` inside a scope) in loops that do not otherwise suspend.
- `runCatching { suspendCall() }` needs the same guard, or a terminal `getOrThrow()`.
- A narrow `TimeoutCancellationException` from your own `withTimeout` may be converted close to that call.
- Cleanup that suspends after cancellation: `finally { withContext(NonCancellable) { release() } }`.
- Moving blocking work to `Dispatchers.IO` changes where it runs, not whether cancellation stops it. Wrap a single interruptible JVM call in `runInterruptible(dispatcher) { ... }`.

## Parallel work and failure

```kotlin
suspend fun loadDashboard(): Dashboard = coroutineScope {
    val items = async { itemRepository.recent() }
    val stats = async { statsRepository.today() }
    Dashboard(items.await(), stats.await())
}
```

- In `coroutineScope`, one failing child cancels the others and rethrows to the caller.
- `supervisorScope` isolates children; each child's failure then needs its own handling (`try` around `await`, or a handler inside `launch`). A `CoroutineExceptionHandler` only works on the root `launch` of a scope and never on `async`.
- `async` without `await` hides its exception until the scope ends.

## Blocking boundaries

`runBlocking` belongs in `main`, a required synchronous framework bridge (an Android `ContentProvider` member, a servlet filter) and migration shims; keep the body to the direct suspend call. Everywhere else make the caller suspend. In tests use `runTest` (see `kotlin-testing`).

## Refactoring order

1. Start at the leaf class farthest from the UI.
2. Make one public function `suspend` and follow the compiler to its callers.
3. At each caller, choose the lifecycle scope deliberately.
4. Delete the unused scope parameter and binding.

Do not rewrite every layer in one change, and do not touch an already-suspending API or a lifecycle owner with explicit cancel and restart policy.

## Dispatchers

Inject dispatchers (`class Repo(private val io: CoroutineDispatcher = Dispatchers.IO)`) so tests can replace them. Default for CPU work, IO for blocking calls, `Main` only for UI. `Dispatchers.IO` exists on the JVM and Android only; in multiplatform code provide it through DI.
