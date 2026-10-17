# Goroutines, channels, errgroup and shutdown

Read this before adding a `go` statement, a channel, a lock, an errgroup or a worker pool, and when reviewing or debugging a data race, goroutine leak, deadlock or shutdown hang.

## Before writing `go`

- Name the goroutine's owner, its input, its result or error path, its cancellation signal, and the event that proves it exited.
- Stay synchronous unless concurrency serves a stated latency, throughput or isolation need.
- Bound fan-out and queue sizes from a real limit. `errgroup.WithContext` plus `SetLimit` covers most fan-out.
- No fire-and-forget goroutines unless their lifecycle, shutdown, error handling and backpressure are explicit.

## Rules

- Only the sender that owns a channel closes it.
- Every blocking send, receive or timer wait needs a `select` on `ctx.Done()` or another exit path.
- Use the simplest synchronization that works. Keep locks out of blocking I/O, and wait for workers (`WaitGroup`, `errgroup.Wait`) before releasing what they depend on.
- Call `wg.Add` before the `go` statement, not inside it. Call `Reset` on a pooled object before `Put`. Prefer unbuffered channels unless a measured need justifies a buffer.
- In a hot `select` loop, reuse a `time.NewTimer` with `Reset` rather than calling `time.After` each pass.

## Pick the primitive by the job

| Job | Use |
| --- | --- |
| Hand data or ownership between goroutines | Channel |
| Protect shared fields | `sync.Mutex`, or `RWMutex` for read-heavy state (it can't upgrade a read lock to a write lock) |
| Counter or flag | Typed atomics (`atomic.Int64`, `atomic.Bool`) |
| Wait for goroutines that can't fail | `sync.WaitGroup` (`wg.Go` on 1.25+) |
| Wait, collect the first error, cancel siblings, or limit concurrency | `errgroup` with `WithContext` and `SetLimit` |
| One-time init | `sync.Once`, `OnceFunc`, `OnceValue` |
| Many callers for the same load | `singleflight` |

## errgroup details

- `g, ctx := errgroup.WithContext(parent)`: the derived `ctx` is cancelled when the first `g.Go` function returns a non-nil error or when `Wait` returns. Pass that `ctx`, not the parent, into the work so siblings stop.
- `Wait` returns the first non-nil error only. Use `errors.Join` over a collected slice if every failure matters.
- Call `SetLimit(n)` before the first `Go`. At the limit, `Go` blocks the caller until a slot frees, and `TryGo` returns false instead of blocking.
- Write results into a slice pre-sized to the input and indexed by position. Each goroutine owns its own index, so no mutex is needed. A shared map or append needs one.
- Before Go 1.22 (per-iteration loop variables), copy the loop variables (`i, v := i, v`) before the closure.
- The `ctx` returned by `WithContext` is dead after `Wait`. Don't reuse it for later work.

## Graceful shutdown

- At the process root, `ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)`; `defer stop()`. Calling `stop()` again as soon as `<-ctx.Done()` fires restores the default signal behaviour, so a second Ctrl-C kills a stuck shutdown.
- Workers watch `ctx.Done()` and return. The owner waits for them (`wg.Wait` or `g.Wait`) with a bounded deadline: run the wait in a goroutine that closes a `done` channel, then `select` on `done` and a timer.
- For `http.Server`, call `srv.Shutdown(shutdownCtx)` with a fresh `context.WithTimeout(context.Background(), d)`, not the already-cancelled signal context. `ListenAndServe` returns `http.ErrServerClosed` on a clean shutdown; don't treat it as a failure.
- Shut down in reverse start order: stop accepting new work, drain in-flight work, then close the dependencies (DB pools, producers) that workers used.
- For gRPC, call `GracefulStop()` and fall back to `Stop()` after a timeout so a stuck stream cannot hang exit.
