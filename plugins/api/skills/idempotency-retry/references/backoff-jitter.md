# Backoff, jitter, budgets, and deadlines

Marc Brooker's "Exponential Backoff and Jitter" (AWS Architecture Blog, 2015) is the canonical comparison. Capped exponential backoff alone helps only a little under contention. Jitter is what cuts total client work in a retry storm.

## Strategies

| Strategy | Formula | Trade-off |
| --- | --- | --- |
| Full jitter (default) | `sleep = random(0, min(cap, base * 2^attempt))` | Lowest client work and server load, slightly longer time to finish |
| Decorrelated jitter | `sleep = min(cap, random(base, prev_sleep * 3))` | Finishes faster, does more total work. Use when a user-facing call sits inside a tight deadline. |
| Equal jitter | half the backoff fixed, half random | More work than full jitter and slower |
| No jitter | `sleep = base * 2^attempt` | Clients that failed together retry together, recreating the spike |

A single-instance batch job pays little of the fleet cost, so the choice matters less there. Apply jitter consistently per host so an overload pattern stays diagnosable.

## Example schedule

A documented schedule integrators can copy: `min(1000 * 2^attempt, 30000)` milliseconds plus up to one second of random jitter, so about 1s, 2s, 4s, 8s, capped at 30s. Prefer the language's library over hand-rolled math, for example tenacity's `wait_exponential_jitter(initial=1, max=10)` with `stop_after_attempt(5) | stop_after_delay(60)`. Bound attempts and total duration together.

## Retry budget

Per-caller caps cannot stop fleet amplification. Track the ratio of retries to original requests over a sliding window (for example one minute). Once it passes the budget (for example 20 percent), fail fast. Token buckets are a common implementation: each retry spends tokens and each success refills them.

## Deadlines

- Set one overall deadline at the top and give each attempt a timeout inside it. A fresh overall timeout per attempt silently extends the caller's wait past what they committed to.
- Down a call chain, pass the remaining budget so each hop subtracts its own time. gRPC does this natively: deadlines are absolute in the API and sent as relative timeouts on the wire to avoid clock skew.
- Set a single timeout from measured latency, about 2 to 3 times p99, and never from an OS default of minutes.

## Stacking

When combining patterns, retry sits outermost: `Retry -> CircuitBreaker -> RateLimiter -> Bulkhead -> call`. The breaker complements retry. Once a downstream is confirmed down, an open breaker short-circuits retries so callers do not each pay the full schedule. Half-open recovery should admit one or two trial requests, not the whole backlog.
