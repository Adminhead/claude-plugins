# Tracing

Sentry's current model is **spans**, with a root (service) span per entry and children below it. "Transaction" is legacy vocabulary, so use it only where the installed SDK's docs still do. Concepts are covered at `docs.sentry.io/concepts/key-terms/tracing/`.

## Boundaries

1. List every execution entry: inbound request or router action, RPC handler, queue consumer, scheduled job, CLI command, serverless invocation, page load or navigation.
2. Each entry gets exactly one root. Framework and router integrations usually create it, so don't layer a manual root over theirs. If valid inbound trace context exists, **continue** it rather than start a disconnected root.
3. Let automatic instrumentation create HTTP, DB, and queue child spans.
4. Add a manual child span only around material uninstrumented work: a domain workflow, an uninstrumented external call, a queue handoff, or significant computation. Don't add spans per function, loop iteration, or already-instrumented dependency.

## Names, ops, attributes

- Name roots from route **templates** (`GET /orders/:id`), operation names, or task classes, and never from concrete paths.
- Use the platform's `op` conventions rather than inventing universal keys.
- Attributes should be bounded booleans, enums, counts, or resource classes. Leave out IDs, raw URLs and query strings, SQL values, payloads, and raw error text. This protects data and keeps span metrics aggregatable.

## Lifecycle

- Prefer callback, context-manager, or decorator forms (`startSpan`, `with start_span`) that end automatically on sync and async completion.
- A manual span ends **exactly once** on success, throw or reject, cancellation, timeout, and early return.
- Carry active context across awaits, callbacks, threads, executors, goroutines (pass `ctx`), and coroutines.
- For streams, websockets, and long connections, define the measured unit and its finish point, and never leave a root open indefinitely.
- For background jobs, each execution is a root or continues the producer's propagated context. Represent retries consistently.
- For serverless and edge, start early and finish before the runtime freezes, following that runtime's guide.
- A span's failed status describes the timed operation. It is not an error event, so don't add error capture just because a span failed.

## Propagation

1. Map the hops: browser→API, service→service, producer→queue→consumer, scheduler→job, manual HTTP/RPC clients.
2. Extract and continue at trusted inbound hops, and inject only through the SDK's documented mechanism. Headers are `sentry-trace` and `baggage`, plus W3C `traceparent` where supported, and they must never be hand-built.
3. For browsers, keep `tracePropagationTargets` a narrow allowlist of your own origins. The receiving server, and every proxy or CDN in between, must allow those headers in CORS. Test the preflight too.
4. For queues and custom transports, use the documented message-propagation path, and keep trace headers out of user-visible bodies.

## Sampling

- Decide at the root with `tracesSampleRate` or `tracesSampler`. Downstream services honor the parent's decision and never resample.
- Exclude noisy routes such as health checks with stable route rules.
- Use a high rate only for a bounded test window, then set a deliberate production rate based on traffic, cost, and critical paths.
- Span metrics need tracing and follow sampling. Business counters independent of sampling belong in [metrics.md](metrics.md).

## OpenTelemetry

If OTel already owns the tracer provider, use Sentry's documented OTel integration and the active OTel context. Don't add a second provider or overlapping auto-instrumentation. For Node, see `javascript/guides/node/opentelemetry/` and `.../using-opentelemetry-apis/`. See also [setup.md](setup.md#opentelemetry-coexistence).

## Platform hazards

| Platform | Watch for |
|---|---|
| Browser / React / SPA | One page-load or navigation root from the router integration, a narrow propagation allowlist, CORS |
| Node | Init before instrumented modules, async context through callbacks and streams, no second OTel provider |
| Python | Framework integrations own request, DB, and task spans. Carry context across asyncio, executors, and Celery. Finish on cancellation |
| Go | Pass `ctx` through handlers, clients, and goroutines. Finish manual spans on every exit |
| Cloudflare / edge | Start at the fetch entry and finish before termination. `waitUntil` work is a separate lifecycle |
| Mobile (Android, iOS, Flutter, RN) | Align with navigation and network auto-instrumentation. No UI spans across app backgrounding. RN spans a JS/native bridge |

## Validation map

Test a success path, an error path, a timeout or cancellation path, a background job, and one cross-service hop. For each, check parentage, stable names, single finish, sampling inheritance, and continuity across the hop.

| Symptom | Check |
|---|---|
| No traces | Tracing enabled, init order, root sample rate |
| Duplicate roots or spans | Overlapping framework or router auto-instrumentation, double init, competing OTel |
| Orphaned span | Context lost across an async boundary, queue extraction |
| Span never ends or has the wrong duration | Unhandled exit path, freeze or shutdown |
| Broken cross-service trace | Allowlist, CORS or preflight, proxy dropping headers, missing extraction |
| Unexpected volume | Sampler, inherited decision, noisy routes, retries, duplicate instrumentation |
