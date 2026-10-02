# Tracing with OpenTelemetry

## Setup order

1. Configure the TracerProvider (exporter, resource, sampler) once at process start, before serving traffic.
2. Register the propagator so context crosses service boundaries. W3C Trace Context is the default pair with baggage (`OTEL_PROPAGATORS=tracecontext,baggage`).
3. Use instrumentation libraries for HTTP servers and clients, gRPC, and database drivers. Add manual spans for business operations.
4. Set `OTEL_SERVICE_NAME`; without it the service appears as `unknown_service`.

## Spans

Name spans for the operation, in low cardinality (`GET /orders/{id}`, `db.query orders`), and keep IDs in attributes. Always end a span, with `defer` or a `finally` block.

Go:

```go
ctx, span := otel.Tracer("checkout").Start(ctx, "charge-card")
defer span.End()
span.SetAttributes(attribute.String("payment.provider", provider))
if err := charge(ctx); err != nil {
    span.RecordError(err)
    span.SetStatus(codes.Error, err.Error())
    return err
}
```

Python:

```python
with tracer.start_as_current_span("charge-card") as span:
    span.set_attribute("payment.provider", provider)
    try:
        charge()
    except Exception as exc:
        span.record_exception(exc)
        span.set_status(Status(StatusCode.ERROR, str(exc)))
        raise
```

`start_as_current_span` already records the exception and sets an error status when one escapes the block, so the explicit calls matter only when you catch and handle the error inside it.

TypeScript:

```ts
await tracer.startActiveSpan("charge-card", async (span) => {
  try { await charge(); }
  catch (err) {
    span.recordException(err as Error);
    span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
    throw err;
  } finally { span.end(); }
});
```

Imports: Go `go.opentelemetry.io/otel/codes`; Python `opentelemetry.trace.Status, StatusCode`; TypeScript `SpanStatusCode` from `@opentelemetry/api`.

## Recording errors

Set the status to Error and record the exception when the operation fails and the error propagates. Leave the status unset on success. The OTel semantic conventions say errors that were retried or handled should not be recorded on spans or metrics, and ask for an `error.type` attribute on failed operations.

## Propagation

Cross-process calls carry the `traceparent` header (`00-<32 hex trace id>-<16 hex parent id>-<flags>`) and optional `tracestate`. HTTP and gRPC instrumentation injects and extracts it. For queues, inject into message headers on publish and extract on consume, or the trace breaks at the broker. Pass the context object through every function in between.

## Sampling

- Head sampling decides at the root span. It is cheap and simple but cannot keep "all error traces".
- Tail sampling decides after the trace completes, usually in a collector. It can keep errors and slow traces, at the cost of stateful collectors and more compute.
- SDK settings: `OTEL_TRACES_SAMPLER=parentbased_traceidratio` with `OTEL_TRACES_SAMPLER_ARG=0.1` keeps 10 percent of root traces and follows the parent's decision downstream. Use a parent-based sampler so a trace is kept or dropped as a whole.

Start with a ratio sampler in the SDK, and add collector tail sampling when the error-trace requirement appears.
