# Python

Package `sentry-sdk`. Context7 IDs are `/getsentry/sentry-python` and `/getsentry/sentry-docs`. Docs live at `docs.sentry.io/platforms/python/`. Versions below are a snapshot.

## Setup

- `sentry_sdk.init(...)` runs once at startup, before the framework app is created where the integration requires it. Web processes and workers (Celery, RQ, asyncio tasks) each initialize in their own process. Watch fork and preload servers (gunicorn `--preload`, uWSGI).
- Many framework integrations (Django, Flask, FastAPI/Starlette, Celery, logging) auto-enable when the package is detected. Check the integrations page before adding one manually.
- Resolve any existing OTel ownership before enabling tracing.
- There's usually no source-map step. Native extensions may need symbols.

## Errors

- `sentry_sdk.capture_exception()` belongs inside `except`. The current exception is implicit, or you can pass it. Preserve `raise … from` chains.
- If you re-raise into a framework integration, choose manual or automatic capture, not both.
- The logging integration turns `ERROR+` records into events by default (`event_level`). That is a common duplicate source when code also calls `capture_exception`.
- Use isolation or request scope (`sentry_sdk.new_scope()`, `isolation_scope()`), never module-global user state.

## Logs

SDK 2.35.0+. Direct logging is on by default in current versions. Call `sentry_sdk.logger.info("order {order_status}", order_status=..., attributes={...})`. `{name}` placeholders become attributes. Attributes are primitives only, and arrays aren't stored, so join them.

| Bridge | Config |
|---|---|
| stdlib `logging` | `LoggingIntegration(sentry_logs_level=…)`. Separate thresholds: `sentry_logs_level` for Logs, `level` for breadcrumbs, `event_level` for error events. Use `capture_sentry_logs` / `enable_logs` per the current page (older flags are deprecated) |
| Loguru | `LoguruIntegration(...)`, with the same three thresholds |

- The logger's own level must let a record through first. Default bridge behavior can send `INFO+` to Logs and breadcrumbs and `ERROR+` as events, so set all three deliberately.
- Stdlib `extra=` fields become top-level attributes, so allowlist them.
- `ignore_logger` affects breadcrumbs and events, not necessarily Logs.
- Filter with `before_send_log`.

## Metrics

SDK 2.44.0+, on by default. `sentry_sdk.metrics.count(name, 1, attributes={...})`, `.gauge(...)`, and `.distribution(name, v, unit="millisecond", attributes={...})`. `before_send_metric` returns None to drop. `sentry_sdk.set_attribute` sets shared attributes on the isolation scope. Check which scope and user attributes attach automatically. No flush is documented.

## Crons

SDK 1.17.0+. Use `@sentry_sdk.crons.monitor(monitor_slug=...)` as a decorator or context manager (async functions from 1.44.1+), or manual `capture_checkin(...)` with the `in_progress` ID. `monitor_config` (1.45.0+) upserts the monitor. Its fields are schedule (crontab or interval), `timezone`, `checkin_margin`, `max_runtime`, `failure_issue_threshold`, `recovery_threshold`, and `owner`. Celery beat has its own integration option (see the Celery integration page).

## Tracing

Framework integrations own request, DB, HTTP, and task spans. Use `with sentry_sdk.start_span(op=..., name=...)` for custom work. Carry context across executors and Celery, and finish spans on `CancelledError`. Set `traces_sample_rate` or `traces_sampler`.
