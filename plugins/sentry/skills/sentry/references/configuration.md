# Configuration of an installed SDK

Use this for integrations, enrichment, filtering, sampling, and lifecycle. Installation and upgrades are in [setup.md](setup.md).

## Workflow

1. Find every init call and config source (see the inventory in setup.md). Record active defaults, auto-enabled integrations, callbacks, sampling, OTel ownership, and shutdown handling. An omitted option can mean different things across versions.
2. Assign each setting one owner, meaning one initializer and one config layer per environment.
3. Merge into the existing init object. Don't replace an integrations array or add a second init path unless the docs define the merge semantics.
4. Keep test and production values separate.

## Integrations

- Add an integration only for a detected dependency and a stated need. Check first whether the SDK already auto-enables it.
- Integration arrays and callbacks may **merge with, filter, or replace** defaults depending on the SDK. In Go, `ClientOptions.Integrations` receives the default list and can add or filter by name, and an empty list disables defaults. That behavior is Go-only.
- Use middleware order exactly as the framework's page states. Don't generalize order across frameworks or versions.
- Look for overlap with existing middleware or instrumentation, which produces duplicate events, breadcrumbs, and spans.

## Scopes and enrichment

| Scope | Holds |
|---|---|
| Global | Immutable deployment metadata only |
| Isolation / request / current | Per-request, per-job, or per-session data. Rely on the SDK's documented isolation and clear it at the boundary |
| Event (`withScope`, `push_scope`, `beforeSend` arg) | Data for one capture |

In concurrent servers, workers, async tasks, and isolates, check that isolation actually holds under concurrency. Something that works in one request can still leak across requests.

| Field | Use for | Keep out |
|---|---|---|
| Tags | Small, stable, searchable dimensions | IDs, emails, raw URLs, messages |
| Contexts | Bounded structured diagnostic state | Raw request objects, bodies, headers |
| Extras | Small debugging details | PII, credentials, large blobs |
| Breadcrumbs | Short lead-up trail | Replacing error events, auth or body data |
| User | Pseudonymous ID if policy allows | Email, IP, names by default |

Data set explicitly on a scope is sent regardless of automatic-collection settings (`sendDefaultPii`, Go's `DataCollection`).

## Privacy controls

Prefer granular documented collection controls over the legacy broad PII switch. In current Go, `DataCollection` supersedes the deprecated `SendDefaultPII` and wins when both are set. Review every newly enabled category. For client-side privacy callbacks, see the scrubbing rule in SKILL.md.

## Sampling vs filtering

These are separate decisions.

- **Error sample rate** (`sampleRate`) controls which error events are sent. It is not trace sampling.
- **Trace sampling** (`tracesSampleRate` / `tracesSampler`) belongs to a tracing policy; see [tracing.md](tracing.md). Where the SDK documents it, `tracesSampler` overrides `tracesSampleRate`, so choose one.
- **Filtering** (`beforeSend`, `ignoreErrors`, `denyUrls`, and similar) drops known noise deterministically. It is not volume control.

Where OTel owns sampling, follow the coexistence path and don't resample.

## Lifecycle and draining

Short-lived processes (CLI jobs, serverless, workers, mobile termination) can exit with buffered events unsent. Add `flush`/`close` only as the platform documents, bounded by its timeout, and keep normal exit flow intact. Go's `sentry.Flush(timeout)` waits up to the timeout and reports whether it finished, which is not proof of delivery.

## Checks

- The diff merges into the existing init and adds no second client or provider.
- Config resolves in test and production modes. Missing config fails open.
- Concurrent requests keep separate scope data.
- Each signal has one owner and no integration overlaps another.
- Serverless, worker, and CLI paths get the lifecycle handling their platform documents.
