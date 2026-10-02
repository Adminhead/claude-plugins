---
name: rest-design
description: Design and review REST/HTTP API contracts for external consumers - resource and method semantics, status codes, one RFC 9457 error envelope, pagination, filtering, rate-limit signaling, and Hyrum's-Law compatibility - and run a contract-first workflow with OpenAPI, linting, contract tests, and two-way consumer drift checks. Use when designing a new API surface, reviewing an OpenAPI spec or existing endpoints for consistency, standardizing error responses, or changing a contract that other teams or clients depend on. Not for GraphQL (api:graphql), gRPC (api:grpc), versioning and deprecation policy (api:versioning), idempotency keys and retries (api:idempotency-retry), or browser-side handling of an API contract (efficient:web-development, if installed).
---

# REST contract design and review

Design or review an HTTP API as a contract that consumers depend on. The goal is one consistent surface: the same casing, pagination, error shape, and status meaning on every endpoint, so it reads as if one team built it. Repo conventions beat the defaults below. If the repo already uses `/v1` paths, a `data` envelope, or snake_case, keep them and apply this skill to what is inconsistent or missing.

## Set the scope first

1. Confirm the paradigm is REST over HTTP. Hand a GraphQL surface to `api:graphql` and a gRPC surface to `api:grpc`.
2. Collect the material. Prefer an OpenAPI document. Without one, enumerate routes from the router, gateway config, or SDK, and log the missing spec as the first finding. For a shipped API, pull 5 to 10 real responses across endpoints, because a spec can claim a consistency that traffic does not have.
3. Decide the audience. Internal-only surfaces can take advisory feedback. Anything partners or the public consume needs the full blocking checklist, because you cannot enumerate or migrate those clients.
4. Record the rule corpus the team follows (its own guidelines, Zalando, Microsoft, Google AIPs). With none, cite [references/review-checklist.md](references/review-checklist.md) by item name.

## Review an existing or proposed surface

1. Run the mechanical checks first. Lint the spec with Spectral or Redocly CLI if the repo has them (see [references/contract-first.md](references/contract-first.md)). Linters catch structure; you own the semantic findings, such as whether an operation makes sense to a consumer.
2. Walk all eight dimensions in [references/review-checklist.md](references/review-checklist.md), in order: URI naming, method semantics, status codes, field naming, pagination, filter and sort, error shape, backward compatibility. Skipping one leaves a hole that a mature reviewer notices.
3. Bucket each finding as Must-change or Improvement. A Must-change cites a written rule or precedent, either from the team's corpus or from the checklist. With no rule to cite, the finding is an Improvement, because taste-based blocks recreate review friction without protecting clients.
4. Treat consistency as the check, not the style. `created_at` on one endpoint and `createdAt` on a sibling is a Must-change whichever casing is right.
5. On a shipped API, a fix to behavior clients already observe is a breaking change. Route it through `api:versioning` instead of demanding a silent in-place fix.
6. Report a scope header (surface, audience, corpus), a pass/fail line per dimension, then a findings table with finding, dimension, bucket, cited rule, and fix.

## Design a new surface

- Model resources as plural nouns with at most 2 to 3 levels of nesting. Give non-CRUD actions one deliberate convention, such as a sub-resource or a custom-method suffix, used everywhere.
- Keep method semantics honest. GET never mutates, PUT replaces fully, PATCH updates partially, DELETE converges on the same end state when repeated.
- Return one error envelope on every endpoint, built on RFC 9457 problem details. Details and the code taxonomy are in [references/errors.md](references/errors.md).
- Paginate every collection that can grow, with a default and a maximum page size. Choose offset, cursor, or keyset once and use it across the surface.
- Signal rate limits on every response that counts against a limit and send `429` with `Retry-After` when throttling. See [references/rate-limits.md](references/rate-limits.md).
- Unsafe operations that clients may retry need an idempotency mechanism. Use `api:idempotency-retry` for the design, and `efficient:web-development` references/api-contract-review.md (if installed) for the browser-side view of the same contract.
- Authenticate with one model across the surface. For issuing keys to your own consumers use `api:keys`; for acting as an OAuth server use `api:oauth-provider`.

## Change a contract safely

Follow [references/contract-first.md](references/contract-first.md): one authoritative OpenAPI, AsyncAPI, or proto artifact, generated consumer types, and a seven-step change protocol that edits the contract before the code. Its two-way drift audit finds consumers that still depend on a field the provider removed, and the reverse.

Prefer addition over modification. Adding an optional field is safe. Removing or renaming a field, changing a type, or adding a required parameter is breaking and needs the versioning machinery.

## Check reference docs

Ship the reference from the spec so docs cannot drift from the contract. The gates (lint, contract tests, snippet parity) are in [references/reference-gates.md](references/reference-gates.md). Read it when auditing or setting up CI for docs.

## References

- [references/review-checklist.md](references/review-checklist.md) - read when walking the eight review dimensions.
- [references/errors.md](references/errors.md) - read when designing or auditing error responses.
- [references/rate-limits.md](references/rate-limits.md) - read when adding rate-limit headers or a `429` response.
- [references/contract-first.md](references/contract-first.md) - read when changing a contract, setting up linting, or auditing consumer drift.
- [references/reference-gates.md](references/reference-gates.md) - read when auditing API reference docs or CI gates for them.

Sources checked for this skill: RFC 9457 (rfc-editor.org/rfc/rfc9457), RFC 9110 for method and status semantics, the IETF RateLimit headers draft (datatracker.ietf.org/doc/draft-ietf-httpapi-ratelimit-headers/).
