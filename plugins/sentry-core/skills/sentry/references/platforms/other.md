# Other platforms

Docs live at `docs.sentry.io/platforms/<platform>/`, with capture APIs under `/usage/` and Logs under `/logs/`. Only the facts below were established. Treat everything else as UNCONFIRMED until the current page says otherwise, and never infer parity from another SDK. PowerShell is not the .NET SDK, and Elixir is not Ruby.

## .NET

- Host and framework integrations own unhandled exceptions: ASP.NET Core middleware, MAUI, desktop dispatchers.
- Capture the original `Exception` and preserve `InnerException` and `AggregateException`.
- Middleware order relative to routing and exception handlers comes from the current guide.
- Check background services, unobserved task exceptions, and whether the logging provider also emits events.
- Readable frames may need PDBs.

## PHP

- Framework integrations (Laravel, Symfony) own unhandled throwables. Capture the original `Throwable` and preserve `getPrevious()`.
- Long-running workers (Octane, queue workers) must reset request scope. Use the documented flush at controlled boundaries.
- **Logs:** use the direct SDK logger or Monolog `LogsHandler`. Monolog `BreadcrumbHandler` sends breadcrumbs only.

## Ruby

- Rack, Rails, and Sidekiq integrations own unhandled exceptions. Preserve `cause` and the backtrace. Keep Sidekiq retry ownership unchanged, and check forking servers.
- Use request-, job-, or fiber-local scope and reset it in pooled workers.
- **Logs:** use direct `Sentry.logger`, or the stdlib `Logger` patch (`:logger`). The patch sends Logs but no structured fields.

## Rust

- The panic integration owns unhandled panics. It must preserve the existing panic hook and the unwind/abort strategy.
- Report handled errors at the consuming layer and preserve source chains.
- Keep the `sentry::init` guard alive for the program's lifetime, because dropping it flushes events.
- **Logs:** use direct macros, the `tracing` integration (fields become attributes), or the `log` integration via `SentryLogger`. Filters can emit Logs plus events or breadcrumbs, so define one output policy.
- **Metrics:** SDK 0.48.0+. The `metrics` feature is on by default in the `sentry` crate. Use `sentry::metrics::counter("name", 1).capture()`, `gauge(...)`, and `distribution(...).unit(sentry::protocol::Unit::Millisecond).capture()`, plus `.attribute()`. Counters are unitless. `ClientOptions::before_send_metric` returns `None` to drop, and `enable_metrics(false)` disables collection. Metrics attach to the current span. Default attributes include user identifiers when `send_default_pii` is on. No metrics flush is documented.
- **Crons:** no Rust SDK Crons API is established. Don't port one.

## Elixir

- Preserve OTP supervision. Don't rescue process exits just to report them.
- Check the current page for Logger integration semantics and Plug/Phoenix order.

## PowerShell

- Classify each failure as terminating, non-terminating, or expected. Preserve `$ErrorActionPreference`, traps, exit codes, and pipeline output.
- Only manual capture is established.

## Unity

- Managed C# exceptions, Unity log callbacks, and native crashes are separate layers. A `Debug.LogError` isn't automatically an exception event.
- IL2CPP vs Mono differ. Validate on the actual target build.
- **Logs:** use `SentrySdk.Logger` plus Unity `Debug` forwarding. `AddBreadcrumbsWithStructuredLogs` can send both, so pick one policy.

## Native C/C++, Godot, Unreal, consoles (Switch, PlayStation, Xbox)

- Only manual capture shown on each `/usage/` page is established. Automatic crash ownership depends on the backend, OS, and target. Console docs may be restricted.
- Crash handlers run under signal-safety constraints, so don't add custom I/O or logging in them.
- Minidumps and attachments can hold secrets and PII.
- Readable stacks need matching debug symbols.
