# Error and crash capture

An **event** is one captured occurrence. An **issue** is Sentry's server-side grouping of events, and issue triage belongs to `sentry-cli:sentry-cli` if installed. Logs, `logger.error`, console output, and breadcrumbs do **not** create exception events.

## Assign one owner per failure path

1. Trace each failure from throw to terminus, marking every catcher: local catch/rescue, UI boundary, framework middleware, task runner, global handler, native crash handler.
2. Choose exactly one Sentry owner per path.
   - **Automatic.** A documented integration owns failures that stay unhandled. SDK init alone doesn't imply this coverage, so check that the integration is active.
   - **Manual.** `captureException` goes where app code intentionally catches and *consumes* an unexpected, actionable failure that would otherwise vanish.
   - **Manual capture then rethrow** into an automatic owner is the classic duplicate, so pick one.
3. Preserve existing responses, fallbacks, retries, propagation, and exit behavior. Never catch a fatal error just to report it, and never add panic or exception recovery for telemetry's sake.

## Capture the real exception

- Pass the original exception object so the stack, mechanism, and cause chain survive (`raise … from`, `%w`, `cause`, `InnerException`, `getPrevious()`). Never stringify it.
- `captureMessage` is only for an actionable condition with no exception, because messages group poorly and carry weak stacks.
- JS: throwing non-`Error` values loses the stack.

## Expected errors

By default, don't report validation failures, cancellation, expected auth denials, 404s, health checks, polling misses, retries, circuit-breaker flow, or known business outcomes. Filter at the narrowest semantic boundary (type or status taxonomy), not with fragile message substrings. Test that an unexpected neighbor still gets through.

## Context

Event-local context comes first, then request/job/isolate-local, and never process-global for user or request data (see [configuration.md](configuration.md#scopes-and-enrichment)). Useful context answers where the failure happened, in what mode, and with what outcome, using component, route template, operation class, and outcome. Clear user context at logout.

## Duplicates

Common sources:

- manual capture plus rethrow
- nested UI boundaries
- a framework hook plus a global handler
- a worker wrapper plus a task handler
- client and server both reporting a serialized failure
- native plus managed bridges (mobile, Unity)
- a logging integration that also emits events at ERROR
- React StrictMode / dev double-invoke (validate in a production build)

Fix ownership. Don't paper over duplicates with fingerprints.

## Grouping and fingerprints

Keep default grouping unless a recurring, understood family needs merging or splitting. Before overriding, write down which events should merge or split and why. Use stable, bounded components and keep `{{ default }}` where supported. Never use IDs, timestamps, URLs, or raw messages. Test at least two same-family and two different-family examples, since a bad fingerprint can merge or fragment issues for good.

## Lifecycle

Async transports can lose events on `os.Exit` / `process.exit`, serverless return, worker completion, forced kill, or mobile termination. Use only the platform's documented wait or flush mechanism, and never arbitrary sleeps. Mobile and native crashes often send on the **next launch**, and OOM, watchdog, or force-quit may never be seen.

## Symptom map

| Symptom | Check |
|---|---|
| No error event | SDK initialized before the failure? Integration disabled? A filter or `beforeSend` dropping it? A boundary consuming it? Process ending before send? |
| Log or message exists, no exception | Code called a logger or `captureMessage` instead of `captureException` |
| Missing stack or cause | Stringified or re-created exception, lost cause while wrapping, non-Error throw, source map or symbol mismatch |
| Leaked or wrong context | Request or user data on global scope, context not propagated or cleared across async or threads |
| Over-grouped or fragmented | Remove the custom fingerprint first, then inspect stack stability and build artifacts |
| Missing worker or serverless event | Wrapper order, async completion, documented flush |
| Missing mobile or native crash | Correct layer enabled? App relaunched? Symbols uploaded? |
| Capture changed app behavior | Restore the original throw, response, or fallback first |

## Testing

Prefer mocks or fakes that assert capture count, exception identity and cause, scoped context, and unchanged propagation. For a live check, use one handled synthetic exception with an opaque marker. A hard crash test needs a disposable build or device and explicit user approval.
