# Error design

Design what the API returns on failure so an integrator fixes the problem from the response alone.

## Envelope

1. Pick the right HTTP status first. Problem details explains a status and never replaces it.
2. Use RFC 9457 problem details (July 2023, obsoletes RFC 7807) with media type `application/problem+json`. The five standard members are `type`, `title`, `status`, `detail`, and `instance`. `type` defaults to `about:blank`, which means "no semantics beyond the status". Keep `title` stable across occurrences and make `detail` specific to this one.
3. Carry the taxonomy in extension members, not in a parallel envelope. Extension names start with a letter, use letters, digits, and underscores, and are at least three characters. Useful members are `code`, `errors[]` for field-level detail, `retryable`, `documentation_url`, and `request_id`.
4. Use one envelope on every endpoint and status, including validation and server errors.
5. Avoid partial-error responses where one `200` mixes success with per-item failure. Allow them only for bulk or long-running operations, and reuse the same error shape per item.

```http
HTTP/1.1 422 Unprocessable Content
Content-Type: application/problem+json
X-Request-ID: req_<id>

{
  "type": "https://api.example.com/errors/validation-error",
  "title": "Validation error",
  "status": 422,
  "detail": "Two fields failed validation.",
  "code": "validation_error",
  "errors": [
    {"field": "age", "code": "out_of_range", "message": "age must be between 18 and 120; received 15."},
    {"field": "email", "code": "invalid_format", "message": "email must be a valid address."}
  ],
  "retryable": false,
  "documentation_url": "https://docs.example.com/errors#validation_error",
  "request_id": "req_<id>"
}
```

If the repo already has an error envelope, map it onto problem details by addition: keep its existing fields as extension members so current clients keep working.

## Taxonomy

The `code` is the machine-readable identity a caller branches on.

| Shape | Fits |
| --- | --- |
| Flat catalog, one code pinned to one status | small surfaces |
| Code plus subcode | default for a REST-only public API |
| Domain plus reason (Google AIP-193 `ErrorInfo`) | one taxonomy shared across REST and gRPC or many services |

Publish the catalog as one reference page where every code a client can see is listed, with a stable anchor each `documentation_url` points to. A code invented at a call site and missing from the catalog is a defect.

## Messages

- Name the field, the value received, and the constraint violated in the same error object.
- Write corrective, non-blaming text: "Provide the date as `MM/DD/YYYY`", not "Invalid date".
- 4xx means the caller should change the request. 5xx means retry later or the provider must fix a bug.
- Link `documentation_url` for errors that need a paragraph instead of cramming it into `detail`.
- Keep `code` untranslated. Localize `detail` only, using `Accept-Language`.

## Retry signals

Design the fields here. Client backoff mechanics live in `api-idempotency` (if installed).

- Retryable by status: `408`, `429` (with `Retry-After`), `502`, `503`, `504`, and sometimes `500`. Non-retryable: `400`, `401`, `403`, `404`, `409`, `422`.
- One `409` is an exception. The idempotency in-flight conflict (`idempotency_request_in_progress`, see `api-idempotency` (if installed)) is retryable with the same key, so set `retryable: true` on it and keep payload-mismatch non-retryable.
- `Retry-After` is the minimum signal on `429` and `503`. RFC 9110 allows delay-seconds or an HTTP-date, so emit delay-seconds.
- Add `retryable` in the body even when the header is present, because a generic handler can branch on it without a status table.
- Treat `500` as ambiguous. Say explicitly whether it is retryable instead of leaving a bare `500`.

## Stability contract

- `code` is stable and safe to branch on. `detail` and `title` text is not contractual and may change.
- Add codes and optional fields freely. Never repurpose, rename, or delete a shipped code outside a version boundary (see versioning.md).
- Give the catalog one gatekeeper so no code ships without an entry.

## Audit findings

- Generic message with no field, value, or constraint.
- Stack trace, SQL text, internal path, or config in a `500` body.
- Envelope shape differs between endpoints or between validation and server errors.
- A code appears in responses but not in the catalog.
- `200` with an error body.
- No request ID on error responses. Return it as a header and echo it in the body so it survives a copy-paste into a ticket.
- An endpoint's OpenAPI `responses` block misses an error it returns. Give each distinct code a named example.
