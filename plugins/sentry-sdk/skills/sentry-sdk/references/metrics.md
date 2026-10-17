# Application metrics

These are custom quantitative telemetry emitted directly through the SDK: counts, gauges, and distributions. This is the current Application Metrics API, not the older beta metrics API (`increment`, `set`), so ignore snippets that use it.

## Is a metric the right signal?

| Need | Use |
|---|---|
| A trend or aggregate independent of trace sampling (business counters, success/failure rates) | Application metric |
| Per-trace performance data | Span attributes and span metrics ([tracing.md](tracing.md)) |
| A record explaining one occurrence | Log |
| An exception with stack and issue workflow | Error |
| Unique users, funnels, product analytics | Product analytics, never a count tagged with user IDs |

## Type

| Type | Question | Example |
|---|---|---|
| Count | How many completed occurrences? | `checkout.completed` |
| Gauge | What is the level now? It can rise or fall | `queue.depth`, `workers.active` |
| Distribution | What range of values occurred? | `checkout.duration`, `payload.size` |

## Design the contract before coding

Write down the owner, the question it answers, the type, a stable name, the unit, the allowed attributes with their bounded values, the expected rate, and the drop rule.

- **Names** are lowercase, dot-delimited, and semantic, such as `image.decode.duration`. Changing the type, unit, or meaning requires a new name.
- **Units** use the SDK's representation (`"millisecond"` in JS and Python, `sentry.UnitMillisecond` in Go, `Unit::Millisecond` in Rust) and the standard list at `develop.sentry.dev/sdk/foundations/data-model/attributes/#units`. Counts are unitless.
- **Attributes** form a short allowlist of finite values like `outcome=success|failure`, a finite `operation`, or an approved region set. Reject unknown values rather than forwarding them. Estimate the name × attribute-combination upper bound before merging.
- Check what the SDK attaches automatically. Python and Rust can add scope user attributes, and Rust does when `send_default_pii` is on.
- Set a volume budget before any hot-path metric. Never emit per request or per user without an explicit bound.

## Placement

- Emit a count once, after the outcome is known, with a bounded `outcome`. Don't count at both entry and exit, on both client and server, or per retry unless attempts are the thing being measured.
- A distribution times the owned operation and records once on resolve, reject, timeout, or cancel. Never fabricate a success value.
- A gauge has one owner and a bounded cadence, not an emission per mutation.

## Filtering and lifecycle

- Where documented, `beforeSendMetric` (or `before_send_metric`, `BeforeSendMetric`) returns the metric or null/None/nil to drop it. Use it for deterministic noise and allowlist enforcement. It won't make an unsafe call site safe.
- `enableMetrics: false` (or the equivalent) disables collection.
- Metrics are buffered and aggregated. Individual points aren't guaranteed. JS and iOS document a flush, while Python, Go, Rust, and Dart pages document none, so don't port one.
- Don't enable tracing just to get metric–trace correlation, and don't claim an OTel metrics bridge.

## Runtime support (snapshot)

| Runtime | Status |
|---|---|
| JS (Node, TanStack Start pages) | 10.25.0+, `Sentry.metrics.*`. Check that other JS runtimes have their own metrics page |
| Python | 2.44.0+, `sentry_sdk.metrics.*` |
| Go | 0.42.0+, `sentry.NewMeter(ctx)` |
| Rust | 0.48.0+, `sentry::metrics::*` builders |
| Apple (Swift only) | Cocoa 9.12.0+, `SentrySDK.metrics` |
| Dart / Flutter | 9.11.0+ |
| Android, Java, .NET, PHP, Ruby, Unity, KMP | Not established. Find a current runtime-specific page before implementing |

Details are in the platform files.
