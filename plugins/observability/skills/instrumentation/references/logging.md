# Structured logging

## Principles

- One JSON object per line, with stable keys: `time`, `level`, `msg`, `service`, `trace_id`, `span_id`, plus event fields. Fixed keys let a log backend index and query them.
- Put variable data in fields, not in the message string. `msg="order created" order_id=42` groups; `msg="order 42 created"` does not.
- Levels: debug for development detail, info for normal operations, warn for degraded but working states, error for failures that need attention.
- Attach request-scoped fields (request ID, tenant, route) once through a child logger rather than at each call.
- Log an error where it is handled. Elsewhere, wrap it with context and return it.
- Keep secrets, tokens, and personal data out of logs. Redact at the logger, not at each call site.

## Correlating with traces

Read the active span's context and add its IDs to each line, or use the language's OTel log bridge.

Go (`log/slog`, `go.opentelemetry.io/otel/trace`):

```go
sc := trace.SpanContextFromContext(ctx)
logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
logger.InfoContext(ctx, "order created",
    "order_id", orderID,
    "trace_id", sc.TraceID().String(), "span_id", sc.SpanID().String())
```

Python:

```python
ctx = trace.get_current_span().get_span_context()
log.info("order created", extra={"order_id": order_id,
    "trace_id": format(ctx.trace_id, "032x"), "span_id": format(ctx.span_id, "016x")})
```

TypeScript:

```ts
const { traceId, spanId } = trace.getActiveSpan()?.spanContext() ?? {};
logger.info({ orderId, traceId, spanId }, "order created");
```

The Go OpenTelemetry docs state there is no user-facing logs API in Go. Use a log bridge (for `slog`, `logrus`, `zap`) to forward logs into OTel, or add the IDs by hand as above.

## Migrating loggers

Move to the language's standard structured logger when the project is on a third-party one for no particular reason (`log/slog` since Go 1.21). Route the old logger through a bridge handler first, replace call sites gradually, then drop the old dependency. `slog.NewMultiHandler` (Go 1.26+) fans one record out to several handlers.
