# Rate-limit signaling

Decide the limit model first (per key, per account, per IP, cost points for GraphQL), then tell clients where they stand.

## Throttle response

- Return `429 Too Many Requests` (RFC 6585) with `Retry-After`, and put a problem-details body behind it (errors.md). A `429` must not be cached.
- `Retry-After` takes delay-seconds or an HTTP-date (RFC 9110). Emit delay-seconds. Document that clients must handle both forms and clamp to zero or more, because parsing a date as an integer yields `NaN` and an instant retry storm.
- Never return a throttle inside a `200` on REST.

## Headers

| Family | Fields | Status |
| --- | --- | --- |
| Legacy | `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` | Common de facto practice. `Reset` is epoch seconds at some vendors and seconds-until-reset at others, so document yours and never change it silently. |
| IETF | `RateLimit-Policy`, `RateLimit` | Internet-Draft, not an RFC. |

The IETF draft is `draft-ietf-httpapi-ratelimit-headers`. Revision 11 (23 May 2026, rechecked on datatracker 2026-10-17) is still an active draft. It defines:

```
RateLimit-Policy: "burst";q=100;w=60
RateLimit: "burst";r=50;t=30
```

`q` is the quota, `w` the window in seconds, `r` the remaining quota, `t` the seconds until it resets, and `pk` a partition key. The values are informative, so a client is not promised the remaining units. Earlier revisions used a different syntax, so the field syntax can still change before it becomes an RFC.

Default to the family your gateway already emits. Add the IETF fields beside it only when you want to follow the draft, and tell clients not to depend on them. When both `RateLimit` and `Retry-After` are present, `Retry-After` wins.

## Policy decisions to write down

- The limit scope (key, account, region). A limit enforced independently per region multiplies a caller's real throughput by the region count, so state the scope.
- Tiers, and the override path for partners.
- Whether SDK retries count against the quota.
- A change-notice rule: raising a limit is free, lowering one is a breaking change that follows the versioning policy (versioning.md).
- Fairness: one tenant's burst should not degrade the others.
