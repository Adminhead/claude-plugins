# REST review checklist

Walk all eight dimensions in order. Each item is pass or fail. A failed item becomes a finding, bucketed as Must-change when a written rule or precedent backs it and Improvement otherwise. Repo conventions override the examples here; the rule is that one choice holds across the surface.

## 1. Resource modeling and URI naming

- Resources are nouns, not verbs: no `/getUser` or `POST /users?action=delete`.
- Collections are plural: `/users`.
- URIs are lowercase with hyphens for multi-word names: `/shipping-addresses`.
- Nesting stops at 2 to 3 levels.
- One URI template holds across the surface.
- Non-CRUD operations use one consistent convention (sub-resource or custom-method suffix), not a new improvisation per endpoint.

Level 2 of the Richardson Maturity Model (proper methods on per-resource URIs) is the practical target. Hypermedia (level 3) pays off mainly when nobody controls client update cycles. Use the model to describe where the surface stands, not to demand more.

## 2. Method semantics

| Method | Safe | Idempotent | Use |
| --- | --- | --- | --- |
| GET, HEAD, OPTIONS | yes | yes | read, metadata |
| POST | no | no | create, non-idempotent action |
| PUT | no | yes | full replace |
| PATCH | no | no | partial update |
| DELETE | no | yes | remove |

RFC 9110 defines PUT and DELETE as idempotent and PATCH and POST as not. Verify claimed idempotency by behavior: a PUT that appends to a log is not idempotent whatever the method says.

- No GET has side effects.
- No POST performs an operation that is naturally idempotent (a replace or delete).
- No PUT accepts a partial object. Partial updates are PATCH.
- DELETE converges on the same end state when repeated (a first `204`, later `404` is fine).
- The same operation shape uses the same method across resources.

## 3. Status codes

- No `200` carrying an error body. Proxies, caches, and monitors read only the status.
- `400` for a malformed request, `422` for a well-formed request that fails semantic validation. Pick one split and apply it everywhere.
- `401` for missing or invalid credentials, `403` for an authenticated caller who lacks permission.
- A create returns `201` with a `Location` header. An accepted async job returns `202`.
- `404` for a missing resource, `405` for an unsupported method, `409` for a conflict.
- `429` carries `Retry-After`.
- The same failure maps to the same status on every endpoint.

Secondary, check when present: `ETag` with `If-None-Match` and `If-Match` plus `412` for optimistic concurrency, and `Cache-Control` on cacheable reads.

## 4. Field naming

- One casing for query parameters and response fields across every endpoint.
- Booleans carry a consistent prefix (`is`, `has`, `can`) if the repo uses one.
- Enum values share one casing.
- A concept has one name everywhere: not `user_id` here and `owner` there.
- A response shape does not change with runtime conditions. Shape variance is a naming inconsistency at a larger grain.
- Path parameters follow the same casing as properties. A spec that mixes snake_case path parameters with camelCase properties without a stated reason has an inconsistency to fix.

## 5. Pagination

| | Offset or page | Cursor or keyset |
| --- | --- | --- |
| Large datasets | slows as offset grows | stays fast |
| Random access and total count | yes | no (count optional) |
| Stable under concurrent writes | no | yes |
| Fits | small sets, page-number UIs | feeds, large or fast-changing sets |

- Every collection that can grow is paginated. Do not paginate a small bounded result by habit.
- A default size and an enforced maximum exist. A request over the maximum returns `400` instead of a silently clamped value.
- Clients can detect the last page without inferring it from a short page (`has_more`, a null `next`, or a `Link` header per RFC 8288).
- One pagination pattern holds across the surface.
- Filters apply before the page is computed.
- Edge cases have a specified shape: empty result, last page, out-of-range request.
- With cursor pagination, the sort is encoded in the cursor so a cursor minted under one sort cannot be replayed under another.
- A total count is a cost decision. Make it opt-in on large or fast-changing sets.

## 6. Filtering, sorting, field selection

- Filters are plain query parameters per field, and the same names appear on every collection.
- Sorting uses one `sort` parameter, a leading `-` or `order` for descending, and commas for multiple fields.
- An unknown filter field or invalid sort field returns `400` or `422`. Silent ignoring makes a typo look like an empty result.
- Full-text search (`q`) stays separate from structured filters.

## 7. Error shape

The envelope shape is checked here. Codes, messages, and retry signals are in errors.md.

- One envelope on every endpoint and status.
- If problem details is claimed, it is RFC 9457 `application/problem+json` and used on every error.
- Status is right independently of the body.
- No `500` body leaks a stack trace, SQL text, internal path, or config.

## 8. Backward compatibility

Hyrum's Law: with enough users, every observable behavior is depended on by somebody, whatever the contract says.

- The team is deliberate about what is observable (fields, codes, ordering, message text) and says what is not contractual.
- Responses leak no implementation detail a client could start relying on.
- The change prefers addition over modification. Removing a field, changing a type, or adding a required request parameter needs `api:versioning`.
- The design extends one live contract instead of forking parallel versions.
- The schema is written first and is the documentation.
- Deprecation is planned at design time.

## Adjacent concerns

Check existence and uniform use only, then defer.

- A versioning scheme exists: `api:versioning`.
- Unsafe retries are covered by idempotency keys or documented: `api:idempotency-retry`.
- One auth model covers the surface: `api:keys`, `api:oauth-provider`, or `efficient:auth` (if installed).
- Rate limits are signaled: rate-limits.md.
- Every endpoint is documented: reference-gates.md.

## Pushback for common rationalizations

| Claim | Response |
| --- | --- |
| "We'll document it later" | The schema is the documentation. Write it first. |
| "We don't need pagination yet" | A collection past about 100 items needs it, and adding it later is a breaking change. |
| "PATCH is complicated, use PUT" | PUT forces every client to send the whole object every time. |
| "Nobody uses that undocumented behavior" | If it is observable, someone depends on it. |
| "Internal APIs don't need contracts" | Internal consumers are still consumers. |
