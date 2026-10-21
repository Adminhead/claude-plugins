# Effects, Futures and blocking

Contents: choose the project's model, Cats Effect, ZIO, Future, blocking work, errors.

## Follow what the code uses

Check `libraryDependencies` and imports. Never introduce a second effect system into a module.

| Evidence | Convention |
| --- | --- |
| `org.typelevel:cats-effect`, `fs2`, `http4s` | `IO`/`Resource`; effects stay values until `IOApp` runs them |
| `dev.zio:zio` | `ZIO[R, E, A]`, layers, `ZIOAppDefault` |
| only `scala.concurrent` | `Future` with an explicit `ExecutionContext` |
| Ox, Kyo or `scala.util.boundary` code | direct style; no monadic wrappers |

For repos built around ZIO, the ZIO project's own `zio-skills` plugin has deeper ZIO guidance; it is not part of this marketplace.

## Cats Effect

- Build programs from `IO`, `Resource`, `Ref` and `Deferred`. Run them only in `IOApp.run`, a test runner, or an adapter at the edge. Calling `unsafeRunSync()` in library or business code deadlocks on a single-threaded runtime.
- Acquire anything closeable with `Resource.make`/`Resource.fromAutoCloseable`, not `try/finally` inside `IO`.
- Blocking calls go in `IO.blocking(...)` (or `IO.interruptible`); never in a plain `IO(...)` or `IO.delay`.
- `parTraverse`, `parMapN` and `race` for concurrency; `Semaphore` or `Queue` to bound it. Keep a fiber's lifetime inside a `Resource` or `background`.
- Use `handleErrorWith`/`attempt`, and keep domain errors in `Either` inside the effect when callers must handle them.

## ZIO

- Dependencies are `ZLayer`s composed at the edge (`provide`); do not pass `ZEnvironment` around by hand.
- Typed errors (`E`) for expected failures, defects (`die`) for bugs. Do not catch everything with `catchAll` and hide defects.
- Blocking work uses `ZIO.attemptBlocking`.
- Tests use `zio-test` with `ZIOSpecDefault`; time is `TestClock`.

## Futures

- Every `Future` operation needs an `ExecutionContext`; take it as `(using ExecutionContext)` or `(implicit ec: ExecutionContext)`. Do not import `scala.concurrent.ExecutionContext.Implicits.global` inside library code.
- `Await.result` belongs in `main` or a test, never inside a `map`/`flatMap` or on a server or actor thread. A blocked pool thread waiting on a task queued behind it is the classic deadlock.
- Wrap blocking calls (JDBC, file IO) in a dedicated pool: `ExecutionContext.fromExecutor(Executors.newFixedThreadPool(n))` created once and shut down on exit. `scala.concurrent.blocking { }` only lets the global pool add threads.
- A `Future` starts eagerly. Build it inside the method that should run it, not as a shared `val`. Use `Future.traverse` or `sequence` for fan-out, `recover`/`recoverWith` for errors, and `transformWith` when you must handle both outcomes.
- `Future { ... }.failed` and unhandled failures are lost if nobody awaits or logs them.

## Errors across styles

Expected errors: typed ADT in `Either` (or the effect's error channel). Unexpected: let it fail. Do not return `null`, and do not catch `Throwable`; catch `NonFatal(e)`.
