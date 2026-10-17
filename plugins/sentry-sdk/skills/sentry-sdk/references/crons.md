# Crons (scheduled-job monitors)

## Identity and ownership

- One stable, non-sensitive **monitor slug** per logical job per environment. Never derive it from tenants, arguments, timestamps, or deploy IDs, and never create a monitor per run, replica, or retry.
- The **scheduler** decides when work is offered. The **owner** is the component that actually executes it. Emit only from the owner. A scheduler, a dispatcher, and a worker must not all emit for one run.
- With replicas or queues, work out the lock, election, or consumer semantics first. One execution produces one lifecycle. Monitoring provides neither locking nor idempotency.

## Lifecycle

| Mode | How | Detects |
|---|---|---|
| Two-step check-in | `in_progress`, keep the returned ID, then complete **that ID** once with `ok` or `error` | Missed runs, failures, and runs exceeding `maxRuntime` |
| Heartbeat | A single terminal check-in | Missed runs and failures, but **not** long-running jobs |
| Wrapper (`withMonitor`, `@monitor` / `with monitor()`) | The SDK does the two-step lifecycle around a callable | Same as two-step, when it wraps exactly one execution |

- Prefer a wrapper when it encloses exactly the execution and preserves the job's return and error behavior. Otherwise use manual check-ins.
- A retry that reruns the job is a new execution with its own ID. Never reuse an ID across retries, overlaps, or restarts.
- Report the terminal state from the known outcome. A `finally` that always sends `ok` is wrong.
- Reporting failures must not turn a failed job into a success, swallow the job's error, alter retries, or exit the process.
- Don't assume deduplication, a cancellation state, or guaranteed delivery. Serverless and edge runtimes can end before the check-in is sent, so follow the runtime's lifecycle docs and don't add sleeps.

## Monitor config (upsert)

Passing `MonitorConfig` / `monitor_config` to a wrapper or `captureCheckIn` **creates or updates the monitor in Sentry** each time it runs. Treat adding or changing it as a remote product change and confirm with the user. The fields are schedule (crontab or interval), `checkinMargin`, `maxRuntime`, `timezone`, failure and recovery thresholds, and owner. Names, types, and version gates vary per SDK, so copy them from the current page and never translate between SDKs. Check the schedule and timezone against the real scheduler.

## Runtime support (snapshot)

| Runtime | Notes |
|---|---|
| Node | SDK 7.51.1+. `Sentry.withMonitor()` from 7.76.0+, plus `captureCheckIn`. Threshold fields need 8.7.0+. Scheduler helpers exist for specific libraries (see the page). `withMonitor` does not create a trace |
| Next.js | Server and Edge runtimes only. `automaticVercelMonitors` is Vercel-only and reads `vercel.json` `crons` (Pages router scope). Don't combine it with another emitter for the same job |
| Cloudflare | 7.51.1+. `withMonitor` from 7.76.0+. Thresholds need 8.7.0+. Don't port Node shutdown or flush logic |
| Python | 1.17.0+. `monitor` decorator or context manager (async from 1.44.1+), `capture_checkin`. `monitor_config` from 1.45.0+ |
| Go | 0.23.0+. Manual `CaptureCheckIn` with `MonitorConfig` (`Schedule`, `MaxRuntime`, `CheckInMargin`, `FailureIssueThreshold`). `CrontabSchedule` / `IntervalSchedule`. No wrapper |
| Rust, browser, mobile, Bun, Deno, others | No SDK Crons guide established. Don't port APIs. The HTTP Crons API (`docs.sentry.io/api/crons/`) exists, but it is a product API, not SDK guidance |

## Verify

Locally, confirm one slug, one owner, no overlapping helper, wrapper, or manual path, a correct ID flow on every exit path, and an unchanged job outcome. Then, with the user's approval, run one controlled execution and check (via the `sentry-mcp-self-hosted` MCP tools, if enabled, or the Sentry UI) for an `in_progress` check-in and a same-ID terminal state with the expected duration. Test failure, missed-run, or timeout behavior only when it can't disturb real work.

| Observation | Next step |
|---|---|
| Duplicate check-ins or monitors | Stop, find the competing emitters, keep one |
| Terminal state has a missing or wrong ID | Fix the execution-local ID flow |
| Job result or retry changed | Take reporting out of job control flow |
| Missing check-in | Check SDK init and lifecycle, then the runtime docs. Don't assert non-delivery |
