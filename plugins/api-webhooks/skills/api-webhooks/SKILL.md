---
name: api-webhooks
description: Designs the provider side of outbound webhooks. Use when adding webhooks to an API, defining the event catalog and payloads, implementing Standard Webhooks signing and secret rotation, reviewing a sender's retry, dead-letter or SSRF defenses, or writing the delivery contract, delivery log, replay and test-event surface customers see.
---

# Provider-side webhook design

Not for receiving webhooks in your own app, consumer-side deduplication (`api-idempotency`), REST error design (`api-rest-design`), or API key issuance (`api-keys`), each if installed.

Sending an HTTP POST is easy. Doing it reliably, safely, and debuggably at scale is the work: isolating slow consumers, retrying with backoff, dead-lettering, signing, and giving customers a way to see what happened.

Webhooks are server-to-server. The consumer may be offline when the event fires, so webhooks fit durable notification. Sub-second client push (live dashboards) is a different problem, and GraphQL subscriptions (`api-graphql`, if installed) or WebSockets cover it.

## Decide first

1. Greenfield or retrofit? For a retrofit, read the current event list, retry behavior, signing scheme, and delivery logging before proposing changes.
2. Build or buy? A managed webhook-sending service is often the right answer when webhooks are a feature of your product rather than the product itself. Rule it out when customer event data may not transit a third party, or when delivery is what you sell. Buying the machinery does not buy the event catalog, the contract, or the docs, so the steps below still apply.
3. Who consumes? Enterprise integrators want the contract in writing and may ask for asymmetric signing and ordering. Typical developers want verification snippets, a stable event ID, and dashboard replay. No-code tools want to see one real payload before they build, so they need test events and a visible delivery log.

## 1. Event catalog

- Name events `resource.action` with a past-tense action (`invoice.paid`), with `.` as the only delimiter and each identifier drawn from `[a-zA-Z0-9_]`. Standard Webhooks asks for a full-stop delimited `type` grouped hierarchically. Pick one convention at launch and keep one string that names the event, not a name split between a header and a body field.
- The catalog is the contract. Every event type gets a stable name, a description, and a payload schema before it ships, because customers subscribe by catalog name.
- Events are immutable: add fields, never repurpose them.
- State whether sub-resource events also fire parent events. Silence breeds assumptions.
- Publish the catalog from the same OpenAPI 3.1 document (`webhooks` section) that describes the API, so docs and payloads cannot drift.

## 2. Payload

- Choose thin or full deliberately. Full payloads embed state, so the consumer needs no follow-up call. Thin payloads carry identifiers and force a fetch, but they never change shape when the API version changes. A thin payload with one or two high-use fields is a legitimate middle.
- Keep payloads small, usually under 20 KB, and link to large data.
- Include `type`, an ISO 8601 `timestamp` of when the event occurred, and `data`.
- Choose one schema-versioning story: pin each endpoint to an API version and render payloads for it, or version the event types themselves and evolve additively. Do not drift into both. An API version bump must never silently reshape payloads that customers already store (see the versioning policy in `api-rest-design`, if installed).

## 3. Signing

Adopt Standard Webhooks (standardwebhooks.com, spec 1.0.0) instead of a bespoke scheme. Details and verification snippets are in [references/signing.md](references/signing.md).

- Send three headers on every delivery: `webhook-id`, `webhook-timestamp` (integer Unix seconds), `webhook-signature`.
- Sign `{id}.{timestamp}.{raw_body}` with HMAC-SHA256, base64-encode, and prefix with the version (`v1,`). Signing the timestamp is what gives replay protection, because a body-only signature is valid forever.
- Send several space-separated signatures during rotation so old and new secrets verify at once.
- Use one secret per endpoint. Prefix secrets (`whsec_`) so scanners can find leaks. Offer asymmetric ed25519 (`v1a`, `whsk_` and `whpk_`) for customers who should not hold a shared secret. Key issuance and storage follow `api-keys`, if installed.
- Your docs must say that consumers verify every request, verify against the raw body before any JSON parser, use a constant-time compare, check the timestamp tolerance, and exempt the webhook route from session auth and CSRF middleware.

## 4. Delivery contract

State the contract in findable sentences: the guarantee, the ordering position, the retry schedule, the ack timeout, and which field carries the dedup ID.

- Promise at-least-once delivery. A consumer that processes and crashes before replying sees the event again. Do not claim exactly-once.
- Use one stable `webhook-id` per event, the same across retries, so consumers can deduplicate (the pattern is in `api-idempotency`, if installed). Add it on day one, because consumers who build without it cannot be helped later.
- Ordering is best-effort. Retries and parallel workers reorder events, and strict ordering lets one failing delivery block a whole endpoint queue. Offer FIFO only as an opt-in, and tell consumers not to infer order from timestamps.
- Deliver from a durable queue with per-endpoint isolation, so a slow endpoint never delays others.
- Retry with exponential backoff and jitter over a span that covers real customer incidents, such as hours to a few days. The spec's example schedule runs 10 attempts over about 75 hours. Linear or constant intervals hammer an endpoint that is already struggling.
- Classify responses. `2xx` is success. Treat `3xx` as failure and tell the customer to update the URL. `410 Gone` means disable the endpoint. Honor `Retry-After` on `429` and `503`. Throttle on `502` and `504`. A persistent `4xx` other than `408` and `429` goes to the dead-letter queue. `5xx`, timeouts, and connection resets retry on the schedule.
- Use a request timeout of about 15 to 30 seconds. Tell consumers to queue the work and acknowledge quickly.
- Dead-letter on retry exhaustion or a non-retriable error. Keep dead-lettered events 7 to 30 days with headers, so they can be investigated and replayed.
- After sustained failure, disable the endpoint and notify the customer by email or dashboard, since the webhook channel is the broken one.
- Recommend that consumers reconcile high-stakes events against your API periodically. Say so in the docs.
- Zero automatic retries is only acceptable with a deliveries-list API, a redeliver action, and reconciliation docs shipping beside it.

Delivery details, SSRF defenses, and subscription states are in [references/delivery-and-lifecycle.md](references/delivery-and-lifecycle.md).

## 5. Subscriptions and debugging

- Model an endpoint as a stateful object with CRUD and three states: active, paused (customer stopped it, config kept), and disabled (platform stopped it after failures). Reject states a customer cannot legally set.
- Filter by event type against the catalog. An endpoint with no filter receives everything, so say so.
- Specify where a new subscription starts (new events only or a retained backlog) and where one resumes after an incident. Warn that deleting and recreating a subscription resets its state.
- Ship a customer portal. Table stakes: a delivery log filterable by endpoint, event type, and status with per-attempt headers, body, response code, and timing, which also makes faithful replay possible.
- Distinguish retry (a new attempt of the same event) from replay (re-ingest the original as a new event). Support single and range replay, and confirm large ranges before running them.
- Offer a "send example event" action driven by each event's schema.

## 6. Document

Grade the docs against five elements before launch: runnable signature-verification snippets, the event catalog with schemas and examples, the exact retry schedule, troubleshooting and recovery steps, and testing tools.

## Audit checklist

- Body-only signature with no timestamp.
- One active secret, forcing revoke-then-deploy rotation.
- No stable event ID across retries.
- "Exactly-once" anywhere in the docs.
- Implicit ordering promises.
- Linear retry intervals, or non-retriable 4xx retried to exhaustion.
- Endpoint URLs not checked against private networks (SSRF).
- A delivery log that stores only the body when metadata travels in headers.
- An API version bump that silently changes stored payload shapes.
- No portal: no log, no replay, no test events.

## References

- [references/signing.md](references/signing.md) - read when implementing or documenting signatures and rotation.
- [references/delivery-and-lifecycle.md](references/delivery-and-lifecycle.md) - read when designing the retry schedule, SSRF protection, or the portal.

Sources checked: Standard Webhooks specification 1.0.0 (github.com/standard-webhooks/standard-webhooks, spec/standard-webhooks.md, rechecked 2026-10-17), RFC 9110 for `Retry-After`, OWASP API Security Top 10 2023 API7 (SSRF).

Adapted in part from [samber/developer-platform-skills](https://github.com/samber/developer-platform-skills) (MIT; see LICENSE at the plugin root).
