# Concurrency

## Contents

- Choosing the primitive
- Executors and shutdown
- Virtual threads
- CompletableFuture
- Shared state and locks
- Interrupts
- Debugging

## Choosing the primitive

| Job | Use |
| --- | --- |
| Counter, flag, single reference | `AtomicInteger`, `LongAdder` (hot counters), `AtomicReference`, or `volatile` for a flag with one writer |
| Shared map or cache | `ConcurrentHashMap` with `computeIfAbsent`/`merge`; never `containsKey` then `put` |
| Read-mostly list | `CopyOnWriteArrayList` |
| Producer and consumer | `BlockingQueue` (bounded), not a synchronized list plus `wait` |
| Limit concurrent access | `Semaphore` |
| Wait for N tasks | `ExecutorService.invokeAll`, `CountDownLatch`, or a `CompletableFuture.allOf` |
| Per-thread context | `ScopedValue` (final in JDK 25) or an explicit parameter; `ThreadLocal` leaks with pools and is costly with many virtual threads |
| Mutual exclusion | `synchronized` on a private final lock object; `ReentrantLock` for `tryLock`, timeouts or interruptible waits |

Never `synchronized` on a non-final field, a `String`, a boxed value, or `this` of a publicly extended class.

## Executors and shutdown

- Size CPU-bound pools near the core count and I/O-bound pools by the downstream limit. Bound the queue; an unbounded `LinkedBlockingQueue` hides overload until the heap is full. Name threads with a `ThreadFactory`.
- Shutdown sequence: `shutdown()`, `awaitTermination(timeout)`, then `shutdownNow()` and one more wait. From Java 19 `ExecutorService.close()` does the first two; use try-with-resources for a scoped pool.
- `submit` swallows task exceptions into the `Future`. Call `get()` or use `execute` with an uncaught-exception handler. A fire-and-forget `submit` that throws leaves no trace.
- A task that blocks on another task in the same bounded pool can deadlock it (thread starvation). Use separate pools or restructure.
- `ScheduledExecutorService`: an exception from a periodic task cancels all later runs. Catch inside the task.

## Virtual threads

- Create with `Executors.newVirtualThreadPerTaskExecutor()` or `Thread.ofVirtual().start(...)`. One per task, never pooled.
- Cap work on a scarce resource (database connections, a rate-limited API) with a `Semaphore`.
- Pinning: from JDK 24 a virtual thread unmounts while blocked in `synchronized` (JEP 491). On 21 to 23 it pins the carrier, so replace `synchronized` around blocking I/O with `ReentrantLock`. Native frames and some class-initializer waits can still pin. Diagnose with `-Djdk.tracePinnedThreads=full` (JDK 21 to 23) or the `jdk.VirtualThreadPinned` JFR event.
- Avoid heavy `ThreadLocal` caches (per-thread buffers, `SimpleDateFormat`); there can be millions of threads.
- Spring Boot: `spring.threads.virtual.enabled=true`, covered in the `spring-boot` skill.

## CompletableFuture

- `supplyAsync` with no executor runs on the common pool. Blocking work there starves other users, so pass your own executor.
- `thenApply` for a plain mapping, `thenCompose` when the function returns a future (flat map). Using `thenApply` with a future-returning function gives `CompletableFuture<CompletableFuture<T>>`.
- Error paths: `exceptionally(ex -> ...)` receives a `CompletionException` wrapper from downstream stages; unwrap with `ex.getCause()`. `handle` sees both outcomes. `whenComplete` observes without recovering.
- `orTimeout` fails the future; `completeOnTimeout` supplies a default. Neither interrupts the underlying work.
- `join()`/`get()` inside another async stage blocks a pool thread. Compose instead.
- `allOf` returns `CompletableFuture<Void>`; read results from the original futures after it completes, and note one failure only surfaces after all complete.

## Shared state and locks

- Check-then-act on shared state needs one atomic step or one lock covering both.
- Double-checked locking requires a `volatile` field; prefer the initialization-on-demand holder or an enum.
- Publish objects safely: final fields, a `volatile` or lock-protected reference, or a concurrent collection. Do not let `this` escape from a constructor (starting a thread, registering a listener).
- Always acquire multiple locks in one global order. Do not call alien code (callbacks, overridable methods) while holding a lock.
- Release in `finally`: `lock.lock(); try { ... } finally { lock.unlock(); }`. `lock()` goes before `try`.
- `Collections.synchronizedList` iteration still needs an external `synchronized (list)` block.

## Interrupts

- A method that catches `InterruptedException` either rethrows it or restores the flag with `Thread.currentThread().interrupt()` and returns promptly.
- Long loops check `Thread.currentThread().isInterrupted()`.
- Blocking calls take timeouts: `poll(timeout)`, `tryLock(timeout)`, `future.get(timeout)`.

## Debugging

- Hang or slow: `jcmd <pid> Thread.print` (add `-l` for locks) or `jstack`; for virtual threads, `jcmd <pid> Thread.dump_to_file -format=json <file>`. Look for threads BLOCKED on the same monitor, or a cycle ("Found one Java-level deadlock").
- Race: reproduce with many iterations and more threads than cores; add a stress test with `CountDownLatch` to start all threads together. Tools: jcstress for low-level races, ThreadSanitizer-style tooling is not available on the JVM.
- Leaked threads: name threads, then compare thread dumps before and after shutdown.
