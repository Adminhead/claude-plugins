# Go

Module `github.com/getsentry/sentry-go`, with sub-modules per integration (`sentry-go/http`, `/gin`, `/echo`, `/fiber`, `/slog`, `/zap`, `/logrus`, `/otel`…). Context7 IDs are `/getsentry/sentry-go` and `/getsentry/sentry-docs`. Docs live at `docs.sentry.io/platforms/go/`. Versions below are a snapshot.

## Setup and lifecycle

- `sentry.Init(sentry.ClientOptions{...})` runs once early in `main`. Follow it with `defer sentry.Flush(2 * time.Second)`.
- Capture is **asynchronous** by default. `os.Exit` and `log.Fatal` skip deferred calls, so a deferred flush never runs on those paths. Don't restructure exits just for telemetry, but note the gap.
- `Flush` returns whether it finished before the timeout, which isn't proof of delivery.
- `ClientOptions.Integrations` receives the default list to filter or extend. Returning an empty list disables all defaults.
- `DataCollection` is the granular data-collection control and supersedes the deprecated `SendDefaultPII`. It wins when both are set. Data set explicitly on a scope (`Scope.SetUser`) is sent regardless.
- `SampleRate` covers errors. `TracesSampleRate` and `TracesSampler` cover traces, and `TracesSampler` overrides the rate, so choose one.
- Set release and environment from build metadata (ldflags), not hardcoded strings.

## Errors and panics

- Capture a returned `error` (`sentry.CaptureException(err)`, or via hub) only at the layer that decides it's unexpected and handles it. Chains built with `%w` and `errors.Join` are unwrapped.
- Recover panics with the framework middleware (`sentryhttp.New(...).Handle`, `sentrygin.New`, …) or `sentry.Recover`/`RecoverWithContext` at goroutine and request boundaries. Keep the app's existing repanic policy (`Repanic` option).
- Never combine middleware recovery, manual recovery, and manual capture for the same panic.
- Goroutines: use the request's hub (`sentry.GetHubFromContext(ctx)`, or `hub.Clone()` for new goroutines). Don't mutate `sentry.CurrentHub()` from concurrent code.
- Sentinel and domain errors are usually expected. Skip them unless policy says otherwise.

## Tracing

Pass `ctx` through handlers, outbound clients, goroutines, and workers. Use `sentry.StartSpan(ctx, op)` with a `defer span.Finish()` on every path. If an OTel `TracerProvider` already exists, use `sentry-go/otel` instead of native tracing.

## Logs

sentry-go 0.33.0+, on by default after `Init`. Use `logger := sentry.NewLogger(ctx)` and its level entries, with `SetAttributes` for attributes that persist on the logger. Copy the exact chain from the current page. Attribute types are `int`, `string`, `bool`, and `float`. Create the logger with the **request** ctx for correlation. Filter with `BeforeSendLog`.

| Bridge | Status |
|---|---|
| `log/slog` (`sentry-go/slog`) | Logs from 0.34.0+. `LogLevel` picks the records to send. Context attributes are extracted explicitly |
| Zap (`sentry-go/zap`) | Logs supported. Honor its sync and flush timeout |
| Logrus (`sentry-go/logrus`) | Use the **log hook** for Logs (0.34.0+). The event hook sends error events. Flush the hook before `Fatal`/`os.Exit` |
| Zerolog | **Not a Logs bridge.** It sends error events and breadcrumbs only |

## Metrics

sentry-go 0.42.0+. This is **not** `Sentry.metrics`.

```go
meter := sentry.NewMeter(ctx)
meter.Count("checkout.completed", 1, sentry.WithAttributes(attribute.String("outcome", "success")))
meter.Gauge("workers.active", 12.0)
meter.Distribution("checkout.duration", 18.4, sentry.WithUnit(sentry.UnitMillisecond))
```

`WithCtx` links a metric to the current span. `ClientOptions.BeforeSendMetric` returns nil to drop. Units apply to gauges and distributions, not counts. No metrics flush is documented. Check signatures against current docs.

## Crons

sentry-go 0.23.0+. There's no wrapper. Use `id := sentry.CaptureCheckIn(&sentry.CheckIn{MonitorSlug, Status: sentry.CheckInStatusInProgress}, monitorConfig)`, then complete the same `*id` with `CheckInStatusOK` or `CheckInStatusError`. `MonitorConfig` fields are `Schedule` (`sentry.CrontabSchedule` / `sentry.IntervalSchedule`), `MaxRuntime`, `CheckInMargin`, and `FailureIssueThreshold`, and it upserts the monitor remotely. A heartbeat is a single terminal check-in. Report failures without changing the job's `error` return.
