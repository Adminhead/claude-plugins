# Delivery, SSRF, and lifecycle

## Retry schedule

Standard Webhooks recommends a schedule spanning multiple days with exponential backoff and some random jitter. Its example:

| Attempt delay | Elapsed |
| --- | --- |
| immediately | 0 |
| 5 seconds | 5 s |
| 5 minutes | about 5 min |
| 30 minutes | about 35 min |
| 2 hours | about 2.6 h |
| 5 hours | about 7.6 h |
| 10 hours | about 17.6 h |
| 14 hours | about 31.6 h |
| 20 hours | about 51.6 h |
| 24 hours | about 75.6 h |

Size the span against real customer incident durations (a deploy takes minutes, an outage hours). Shorter spans of a few hours are acceptable for low-stakes events. Publish the exact numbers. "We retry with backoff" is not a schedule.

Move to per-endpoint configurable schedules and a circuit breaker with half-open probing only when many endpoints are failing at once and loading the pipeline, or when enterprise customers negotiate delivery SLAs.

## Response handling

| Response | Action |
| --- | --- |
| `2xx` | Success, stop retrying |
| `3xx` | Failure. Do not follow redirects. Tell the customer to update the URL. |
| `410` | Disable the endpoint and stop sending |
| `429` | Throttle and honor `Retry-After` |
| `502`, `504` | Throttle, the consumer is likely under load |
| `503` with `Retry-After` | Schedule the next attempt from the header |
| `408` | Retry per schedule |
| other `4xx` | Dead-letter (permanent failure) |
| other `5xx`, timeout, reset | Retry per schedule |

A persistent `4xx` other than `408` and `429` goes straight to the dead-letter queue, because retrying a permanent failure wastes the budget and looks like an attack. Use a 15 to 30 second request timeout.

## SSRF

Customers supply URLs that your delivery workers call from inside your network, so an attacker can point one at internal services or cloud metadata.

- Send deliveries through an egress proxy that refuses private, loopback, and link-local addresses (Stripe's open-source Smokescreen is an example), or run the workers in a network segment with no internal access.
- Resolve the hostname and check the address you actually connect to, so DNS rebinding cannot swap it afterward. Do not follow redirects.
- Require HTTPS endpoints where the payload is sensitive. The signature proves integrity but does not encrypt.
- If customers need a fixed source, publish static IPs for their firewalls.

Reference: OWASP API Security Top 10 2023, API7 Server Side Request Forgery.

## Subscription state model

| State | Set by | Meaning |
| --- | --- | --- |
| active | customer | deliveries flow |
| paused | customer | stopped, configuration and filters kept |
| disabled | platform | stopped after sustained failure or a `410`, customer notified |

Expose only states a customer can legally reach. Document that edits can take a minute or two to reach the delivery path, so it is not filed as a bug.

## Debug surface

- Delivery log with per-attempt request headers, body, response code, and timing. If metadata is in headers, the log must store them or replays are unfaithful.
- Retry (new attempt of the same event) and replay (re-ingest as a new event), single and by range.
- Test events generated from each event's schema.
- Failure view grouping exhausted deliveries by endpoint and status, with a notification.
- Document the "200 then crash" blind spot: a handler that acknowledges and then fails told you delivery succeeded, so no portal can see inside it.
- An endpoint management API (add, list, remove) lets customers and automation tools register endpoints. Fan-out to several endpoints per customer is common.

## Metrics

Track delivery success rate per endpoint, dead-letter rate, and time to detect a failing endpoint. Set baselines from the first month and watch the trend.
