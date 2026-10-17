# Thread.Abort to cooperative cancellation

Read when moving .NET Framework code that calls `Thread.Abort`, catches `ThreadAbortException`, calls `Thread.ResetAbort`, uses `Thread.Interrupt` to stop a thread, or calls ASP.NET `Response.End()` / `Response.Redirect(url, true)`; or when `SYSLIB0006` or a `PlatformNotSupportedException` from `Thread.Abort` appears after retargeting.

On .NET Core and .NET 5+, `Thread.Abort` throws `PlatformNotSupportedException` (and is obsolete as `SYSLIB0006` since .NET 5). There is no way to forcibly stop a managed thread; code must check a `CancellationToken`. Code that only uses `Thread.Start`, `Join` or `Sleep` needs no migration: say so, and label any `Task.Run` modernization as optional.

Commit after each pattern so the change is reviewable and bisectable.

## 1. Inventory

```bash
grep -rnE 'Thread\.(Abort|ResetAbort|Interrupt)|\.Abort\(\)|ThreadAbortException|Response\.End\(\)|Response\.Redirect\([^)]*,\s*true\)|SYSLIB0006' --include='*.cs' .
```

Classify the intent of each hit.

## 2. Pattern to replacement

| Pattern | Replacement |
|---|---|
| Cancellable work loop | Take a `CancellationToken`; check `token.ThrowIfCancellationRequested()` at safe checkpoints; the caller calls `cts.Cancel()` |
| Timeout enforcement | `new CancellationTokenSource(timeout)` or `cts.CancelAfter(timeout)`; for tasks, `await task.WaitAsync(timeout, token)` or `Task.WhenAny(work, Task.Delay(timeout, cts.Token))` and cancel the source when the delay wins |
| Blocking call interruption | `Thread.Sleep(ms)` -> `token.WaitHandle.WaitOne(ms)` or `await Task.Delay(ms, token)`; `evt.WaitOne()` -> `WaitHandle.WaitAny(new[] { evt, token.WaitHandle })`; synchronous I/O -> async overloads that take a token |
| ASP.NET request termination | Delete `Response.End()` and return; `Response.Redirect(url, true)` -> `Response.Redirect(url)` or return a redirect result; in ASP.NET Core pass `HttpContext.RequestAborted` to long work |
| `ThreadAbortException` as control flow | Catch `OperationCanceledException` where a decision is made; move cleanup into `finally` or `token.Register(...)` first |
| `Thread.ResetAbort` to keep the thread alive | Split the work into units; check `token.IsCancellationRequested` between units; make a new `CancellationTokenSource` (optionally linked to a parent) per unit instead of resetting one |
| Code that can't cooperate (third-party, native) | Run it in a child process and `Process.Kill(entireProcessTree: true)` on timeout |

## 3. Clean up

| Old | New |
|---|---|
| `Thread.Abort()` | `CancellationTokenSource.Cancel()` |
| `catch (ThreadAbortException)` | `catch (OperationCanceledException)`, only where you act on it |
| `Thread.ResetAbort()` | Per-unit token check |
| `Thread.Interrupt()` used to stop work | Token signalling, or set a `ManualResetEventSlim` the thread waits on. `Interrupt` still exists but only wakes threads in `WaitSleepJoin` and throws `ThreadInterruptedException`, a different exception |
| `#pragma warning disable SYSLIB0006` | Remove with the call |

## 4. Verify

- Build for the new TFM: no `SYSLIB0006`, and the inventory grep returns nothing.
- Tests that relied on `Thread.Abort` for timeout or cleanup now use tokens and pass.
- Timeout and blocking scenarios stop within an acceptable time after cancellation.

## Pitfalls

- A token parameter that's never checked: cancellation only happens at checkpoints, so place them in loops and between expensive steps, and size the interval to the latency you can accept.
- A method in the chain that doesn't forward the token stalls cancellation there.
- Swallowing `OperationCanceledException`: let it propagate to the orchestration point that decides what to do.
- Undisposed `CancellationTokenSource` leaks timers and registrations; wrap it in `using`.
- Deleting `ThreadAbortException` catch blocks that held cleanup (lock release, transaction rollback) without moving that logic to `finally`.

Sources: [Thread.Abort is obsolete](https://learn.microsoft.com/dotnet/core/compatibility/core-libraries/5.0/thread-abort-obsolete), [Cancellation in managed threads](https://learn.microsoft.com/dotnet/standard/threading/cancellation-in-managed-threads), [SYSLIB0006](https://learn.microsoft.com/dotnet/fundamentals/syslib-diagnostics/syslib0006).
