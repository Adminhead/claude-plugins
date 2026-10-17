# Observability: logs, correlation IDs, metrics

Read this when adding structured logging, request correlation, or metrics to a Python service. Follow the logging and metrics stack the repo already uses, and apply these rules to it. The examples use `structlog` and `prometheus_client`. For language-neutral guidance on signals, labels, and alerts, use `observability-instrumentation` if installed.

## Structured logs

- Emit one event per line with a short event name and fields (`log.info("order_created", order_id=order.id)`), not an interpolated sentence. Fields are what make logs queryable.
- Configure logging once at the entry point. Put `structlog.contextvars.merge_contextvars` first in the processor list so bound context reaches every event.
- Keep field names consistent across the service: `correlation_id`, `duration_s`, `error_type`, and the same id names everywhere.
- Log the exception type and let the logger render the traceback (`log.exception(...)`). Don't log `str(exc)` as a field, since it can carry user data or secrets.
- Don't put raw user identifiers, tokens, or request bodies in logs. Log an opaque internal id when you need to join records.

| Level | Use for |
| --- | --- |
| `debug` | Developer diagnostics, off in production |
| `info` | Request and job lifecycle, completed operations |
| `warning` | Handled anomalies: a retry, a fallback, a limit nearly reached |
| `error` | Failures that need attention. Expected outcomes, such as a wrong password, are `info` |

## Correlation IDs

Mint or accept an ID at ingress, bind it into `contextvars`, return it in the response, and send it on outbound calls. Use a pure ASGI middleware. It runs the app in the same task, so the binding reaches async handlers and sync handlers that FastAPI runs in a threadpool.

```python
import re
import uuid

import structlog

_VALID_ID = re.compile(r"[A-Za-z0-9._-]{1,64}")

class CorrelationIdMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        incoming = dict(scope["headers"]).get(b"x-correlation-id", b"").decode("latin-1")
        cid = incoming if _VALID_ID.fullmatch(incoming) else uuid.uuid4().hex
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(correlation_id=cid)

        async def send_with_id(message):
            if message["type"] == "http.response.start":
                message.setdefault("headers", []).append((b"x-correlation-id", cid.encode()))
            await send(message)

        await self.app(scope, receive, send_with_id)
```

- Validate an incoming ID before trusting it. An unchecked header lets a client inject newlines or oversized values into logs.
- Clear the context at the start of each request so one request's ID never leaks into the next.
- Forward the ID on outbound calls: `headers={"X-Correlation-ID": structlog.contextvars.get_contextvars()["correlation_id"]}` for `httpx`.
- Context variables don't cross into other processes or queue workers. Pass the ID in the job payload and bind it again in the worker.
- If the service already uses OpenTelemetry, its trace ID is the correlation ID. Don't run two schemes side by side.

## Metrics

- Track the four golden signals at each service boundary: latency, traffic, errors, and saturation (pool usage, queue depth).
- Name metrics with a base unit and a `_total` suffix on counters (`app_http_requests_total`, `app_http_request_duration_seconds`), following the Prometheus naming guide.
- Keep label values bounded. A label that takes user ids, emails, or raw URLs creates a new time series per value. Use the route template (`/users/{id}`), method, and status class.
- Record latency in a `Histogram` and read percentiles from it. `Histogram.time()` works as a decorator or context manager.
- Check your metrics and logs in a test that exercises the path, because instrumentation fails silently.

A small context manager keeps timing and error logging out of business code:

```python
import time
from contextlib import contextmanager

import structlog

log = structlog.get_logger()

@contextmanager
def timed(op: str, **fields):
    start = time.perf_counter()
    try:
        yield
    except Exception as exc:
        log.error("operation_failed", op=op, duration_s=round(time.perf_counter() - start, 4),
                  error_type=type(exc).__name__, **fields)
        raise
    log.info("operation_done", op=op, duration_s=round(time.perf_counter() - start, 4), **fields)
```
