---
name: api-idempotency
description: Designs idempotency keys and safe retries for HTTP APIs, server and client. Use when adding an Idempotency-Key header, fixing duplicate or double-submitted writes, auditing a key implementation for races (atomic claim, in-flight state, replay window), or setting client retry policy, full-jitter backoff, retry budgets and SDK retry defaults.
---

# Idempotency keys and safe retries

Not for the shape of error responses (`api-rest-design`), webhook delivery retries (`api-webhooks`), or Postgres locking and index details (`postgres`), each if installed.

A retried write is safe only when both halves exist: a server that collapses duplicates and a client that retries with discipline. Retry guidance without key support, or keys without retry guidance, leaves the guarantee open exactly where a dropped connection tests it.

Exactly-once delivery is impossible over an unreliable network. A key buys effectively-once: at-least-once delivery plus duplicate collapse, within the scope and window where you implement it. Do not write "exactly-once" in code comments or docs.

`Idempotency-Key` is not a standard. The IETF draft (`draft-ietf-httpapi-idempotency-key-header`) stopped at revision 07 and is an expired Internet-Draft (checked on datatracker 2026-10-17), so TTL, mismatch behavior, and concurrency handling are whatever you decide. Design them and document them. RFC 9110 defines GET, PUT, and DELETE as idempotent and POST and PATCH as not, and says nothing about the key pattern.

## Before designing

Collect these from the repo, then ask the user only for what the code cannot answer.

1. Which state-changing endpoints are retry-unsafe? List them from the router or OpenAPI. Verify claimed idempotency by behavior, since a PUT that appends to a log is not idempotent.
2. What store holds keys: a relational database with unique constraints, a conditional-write key-value store, or only a cache? This decides the claim mechanism.
3. Does any request call an external system that cannot be rolled back (a card charge, an email)? This decides whether you need recovery points.
4. What is the longest retry chain (dead-letter replays, scheduled re-runs, dispute windows)? This sets the replay window.
5. Who retries: first-party code, integrators with raw HTTP, or callers using your SDKs? SDK defaults decide behavior for everyone who never reads the docs.

## Server side

### 1. Key contract

- The client mints the key and the server never derives it. A hash of the request parameters breaks when two identical requests are both intended.
- Scope keys per caller: unique on `(account_id, idempotency_key)`, never global.
- Recommend a derivation. Prefer an event-derived key (`order-confirm-<orderId>`), which a retry cannot fail to reuse. Next best is request-scoped, then a random UUID generated once and reused. A fresh value per attempt (`Date.now()`, a regenerated UUID) defeats the mechanism, so document it as the anti-pattern.
- Store a fingerprint (a checksum of the payload) beside the key. The same key with a different payload is a client bug. Reject it with a distinct code instead of silently replaying. Status choice: `422` is what the expired IETF draft proposes, and `409` is common in the field. Pick one and keep it distinct from the in-flight response.
- Store both outcomes. Decide explicitly whether a stored failure replays verbatim or may be re-attempted without side effects. Leaving it undecided is a design gap.

### 2. Atomic claim

Check-then-insert is a race: two concurrent retries both see "absent" and both run. Let the storage layer pick the single winner.

- Relational default: a unique constraint on `(account_id, idempotency_key)`, with the claim inserted in the same transaction as the business mutation. The loser's `INSERT` fails or returns no row, and that is its conflict signal.
- Conditional-write stores (DynamoDB-style) give the same single-winner claim with a conditional put.
- Use a row lock inside a SERIALIZABLE transaction when requests span foreign state changes and you need in-flight as a first-class, resumable state.
- Fence lock takeover. When a lock expires and a second executor takes over, the first may still be running. Bump a `lock_generation` on every takeover and include `AND lock_generation = <mine>` in every phase update, so a stalled executor's writes affect zero rows and it stops. Set the lock timeout longer than the longest phase, including its foreign-call timeout.
- A bare Redis `SETNX` with a TTL is not a lock for this purpose. A client paused past its lease can still write after the lock moves on, and without a fencing token nothing stops it. If Redis is all you have, add fencing tokens. A database constraint avoids the problem.
- The claim and the mutation commit as one unit. A claim outside the transaction can record a key for work that never happened, or the reverse.

The schema, claim query, and state branches are in [references/key-lifecycle.md](references/key-lifecycle.md).

### 3. Three states

A key is a state machine: absent, in-flight, complete.

| Situation | Behavior |
| --- | --- |
| Never received | Proceed as a first attempt. |
| Claimed, no result yet | Return the in-flight conflict, or resume from the last recovery point once the original lock has expired. |
| Complete, response lost | Replay the stored response verbatim with no re-execution. |

For the in-flight case choose one: reject with `409` and the code `idempotency_request_in_progress`, which clients retry with the same key (simplest), block for a bounded wait when the caller needs the result synchronously, or return `202` with a status URL for long-running work. Never let the second caller through because the first "seems stuck".

For multi-step requests that call external systems, split the work into atomic phases around each foreign call and persist a recovery point between them. Record intent before the call so a crash between call and response leaves evidence. A retry resumes at the stored phase. A crash after a foreign call but before its phase commits still leaves the call in doubt, so each foreign call must be safe to repeat: send the vendor its own idempotency key derived from `(key, phase)`, or query the foreign system's state before calling again.

Run recovery as background jobs. A completer pushes abandoned in-flight requests to completion using only keys and recovery points. A reaper deletes expired keys and logs what it could not finish for a human. Passive expiry alone leaves half-finished requests half-finished.

### 4. Retention

- Replay window: set it from the longest retry chain, not from storage cost. About 24 hours is a common default. A 24-hour window in front of a 7-day dead-letter replay is a duplicate waiting to happen.
- Keep records past the replay window (for example 72 hours) so a bad weekend deploy's failures can be pushed through on Monday.
- A key reused after the window is a new request.
- Store the full response (status, headers such as `Location`, body), not a summary, so the replay is indistinguishable from the original.

## Client side

- Retry an allowlist: `408`, `429` (honor `Retry-After`), `502`, `503`, `504`, connection timeouts or resets, and the in-flight conflict (`409` with `idempotency_request_in_progress`), always with the same key. Treat `500` with care, because some are bugs that fail identically. Never retry other 4xx (including the payload-mismatch response), auth failures, or programming errors.
- Do not retry a timeout on a non-idempotent operation unless a key is already in place.
- Back off with full jitter: `sleep = random(0, min(cap, base * 2^attempt))`. It minimizes total client work and server load. Jitterless backoff re-synchronizes a fleet into the spike that caused the failures. Formulas and trade-offs are in [references/backoff-jitter.md](references/backoff-jitter.md).
- Bound both attempts and total duration, and log each retry (attempt, error, next wait).
- Add a fleet retry budget. Stop retrying once retries exceed a set share of traffic over a sliding window, because 100 instances each retrying 3 times amplify load 300x while each looks reasonable.
- Set one overall deadline at the top and budget per-attempt timeouts inside it. Do not create a fresh overall timeout per attempt.
- Use the language's retry library (tenacity, Resilience4j, or equivalent) before hand-rolling. See `python` for its reliability guidance and `coding` for the repo-wide retry policy, each if installed.
- For SDKs you ship, default retries on, with jitter and a small attempt cap, and auto-generate keys for unsafe operations. Defaults are the contract for callers who never read docs.

## Document the contract

Integrators have only your docs. State which endpoints accept the key, the header name and maximum length, the recommended derivation, the scope and replay window as concrete numbers, what happens after expiry, both conflict responses with distinct codes, whether a stored failure replays, and a worked retry schedule with numbers. Error body design is in `api-rest-design`, if installed.

## Audit checklist

Each item is a finding.

- A key accepted but never stored or honored. This is worse than no key.
- A new key generated per attempt.
- Check-then-insert claiming.
- Binary key state with no in-flight representation.
- Same key, different payload, silently replayed.
- Replay window shorter than the longest retry chain.
- Bare `SETNX` as the claim.
- No decision on replay versus re-execute for stored failures.
- A retry loop that resets its overall timeout each attempt.
- Backoff without jitter.

## Verify

- Concurrency gate: fire N identical concurrent requests with one key at a state-changing endpoint. Exactly one side effect must run, and the other N-1 get the in-flight conflict or the stored replay.
- Crash gate: for multi-step requests, kill the process between phases and after each foreign call, retry, and confirm it resumes with at most one effective external side effect per call (the vendor dedupes on the derived key, or the state check skips the call). Also stall one executor past the lock timeout and confirm its late writes affect zero rows.

## References

- [references/key-lifecycle.md](references/key-lifecycle.md) - read when implementing the key store, claim query, state branches, or recovery jobs.
- [references/backoff-jitter.md](references/backoff-jitter.md) - read when choosing backoff formulas, budgets, or deadline rules.

Sources checked: IETF idempotency-key draft revision 07, expired (rechecked 2026-10-17) (datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/), RFC 9110 for method semantics, Marc Brooker, "Exponential Backoff and Jitter" (aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/), Brandur Leach, "Implementing Stripe-like Idempotency Keys in Postgres" (brandur.org/idempotency-keys).

Adapted in part from [samber/developer-platform-skills](https://github.com/samber/developer-platform-skills) (MIT; see LICENSE at the plugin root).
