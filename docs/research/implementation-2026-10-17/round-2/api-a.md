# Batch api-a report

## Plugins created

| Name | Type | Description (plugin.json) | Sources | Deps |
| --- | --- | --- | --- | --- |
| api-rest-design | skill | REST/HTTP API contract design and review skill: resources and methods, status codes, RFC 9457 errors, pagination, rate-limit headers, contract-first OpenAPI with drift checks, and versioning and deprecation policy. | archive api/skills/rest-design (+5 refs), api/skills/versioning (REST part -> references/versioning.md, template -> references/versioning-policy-template.md); seed samber/developer-platform-skills (MIT) | none |
| api-idempotency | skill | Idempotency keys and safe retries for HTTP APIs: per-account client keys, atomic claim, in-flight and replay states with recovery jobs, and client retry policy with full-jitter backoff, retry budgets and deadlines. | archive api/skills/idempotency-retry (+2 refs); seed developer-platform-skills (MIT) | none |
| api-webhooks | skill | Provider-side outbound webhooks skill: event catalog and payloads, Standard Webhooks signing and rotation, at-least-once delivery with backoff and dead-lettering, SSRF defenses, and the delivery log and replay surface. | archive api/skills/webhooks (+2 refs); seed developer-platform-skills (MIT) | none |
| api-keys | skill | API keys a platform issues to its consumers: prefixed checksummed key format, hash-only storage and lookup, scopes, dual-key rotation with last-used telemetry, service-account ownership and offboarding, keys versus OAuth. | archive api/skills/keys (split: SKILL.md 76 lines + references/storage-and-rotation.md); seed developer-platform-skills (MIT) | none |

Each plugin ships a `LICENSE` with the MIT text and `Copyright (c) 2026 Samuel Berthe (samber/developer-platform-skills)` (copied from /home/buck/Projects/3rd-party/developer-platform-skills at 594cf70), and each SKILL.md ends with an "Adapted in part from ... (MIT; see LICENSE)" line.

## Validation and tests

- `claude plugin validate --strict plugins/<name>` for all four: passed.
- No scripts or mod tests in these plugins.
- Evals: archived routing evals moved with renamed skills: `api-rest-design/evals/route-rest-vs-web` (neighbour `web-development:web-development`), `api-keys/evals/route-keys-vs-auth` (neighbour `app-auth:app-auth`), `api-webhooks/evals/route-webhooks-vs-idempotency` (neighbour `api-idempotency:api-idempotency`). Added `api-idempotency/evals/route-idempotency-vs-webhooks` (new). `route-oauth-vs-auth` left in the archive for the api-oauth-provider implementer. Evals not run.
- grep for codegraph, claude-mem, coding-core:, github:, Efficient, api:, auth:, db:, web:: none (one false hit on the `app-auth:app-auth` grader string).

## Deviations

- Versioning: REST policy folded into `references/versioning.md` (rewritten, renumbered without the paradigm step); the policy template is a second reference (`versioning-policy-template.md`) with its GraphQL variant removed and replaced by a pointer to `api-graphql`. The GraphQL continuous-evolution material was NOT copied: the api-graphql implementer takes it from `archive/plugins/api/skills/versioning/` (SKILL.md step 1 GraphQL bullet, failure mode "Treating GraphQL @deprecated as removal", and policy-template.md "GraphQL variant").
- api-rest-design description now also triggers on versioning/deprecation/sunset work, since the separate versioning skill is gone.
- Old cross-refs mapped: auth:auth -> app-auth, db:postgres -> postgres, coding-python:python -> python, coding-core:coding -> coding, web:web-development -> web-development, api:versioning -> versioning.md (internal).
- "Not for" lists moved from descriptions into bodies; all descriptions under 350 chars.

## Verified 2026-10-17

- IETF ratelimit-headers draft: still revision 11 (2026-05-23), active (datatracker API).
- IETF idempotency-key draft: revision 07, state Expired (datatracker API). Wording updated.
- RFC 9745: Standards Track, March 2025 (rfc-editor).
- Standard Webhooks spec: Version 1.0.0, whsec_/whsk_/whpk_, v1/v1a, space-separated signatures (raw spec on GitHub).
- Stripe Dashboard rotation: both keys valid for up to 7 days (docs.stripe.com/keys).

## Unverified / TODO

- GitHub token format details (30-char body + 6-char CRC32) and AWS IAM key-rotation procedure were carried over from the archive, not rechecked.

## Follow-ups

- Coordinator: register the four plugins in marketplace.json (direct installs, no meta per plan decision 3).
- Run the four routing evals once `app-auth` exists (its neighbour grader is vacuous until then).
