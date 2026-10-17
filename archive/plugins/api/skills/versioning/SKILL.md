---
name: versioning
description: Define an API versioning and deprecation policy - a written breaking-change definition, version scheme choice (URI path, header, date-pinned, or additive-only), notice windows by audience, Deprecation and Sunset headers, enforcement at the sunset date (410 Gone with a successor link versus fall-forward), and governance - with REST version-and-sunset and GraphQL continuous evolution treated as separate policies. Use when planning a /v2, retiring a version, deciding whether a change is breaking, or writing a deprecation policy or timeline for API consumers. Not for REST contract review (api:rest-design), gRPC package versioning and buf breaking checks (api:grpc), or GraphQL schema design (api:graphql); client SDK versioning is plain SemVer and out of scope.
---

# API versioning and deprecation policy

Choosing a scheme is the easy half. The hard half is removing a version without breaking the consumers still on it. A policy answers five questions in writing: which scheme carries the version, what counts as breaking, how long consumers get, how you tell them and enforce the end, and who signs off on breaking anything.

This skill writes the policy. `api:rest-design` checks at review time that a scheme exists and is applied uniformly.

## Gather the inputs

Ask the user only what the repo cannot answer.

1. Paradigm: REST, GraphQL, gRPC, or several? REST defaults to version-and-sunset. GraphQL defaults to continuous evolution (step 1).
2. Audience: internal, partner under contract, or public? This sets the notice period more than anything else.
3. Current state: greenfield, one unversioned live API, or several versions already live? Is any version both deprecated and still the default?
4. Breaking-change pressure: how many breaking changes shipped or were blocked in the past year?
5. Reachability: can you identify and contact every consumer? Do any ship mobile apps or run enterprise change management?
6. Deadline and horizon: is this retiring one version or a policy the platform will run for years?

## 1. Settle the paradigm

- **REST: version and sunset.** Consumers opt into a new version, you deprecate the old one, and retire it on a schedule. Steps 3 to 6 apply in full.
- **GraphQL: continuous evolution.** graphql.org says GraphQL "takes a strong opinion on avoiding versioning by providing the tools for the continuous evolution of a GraphQL schema". Add fields, mark old ones `@deprecated(reason: "...")`, and remove them only after usage telemetry shows no real consumers. `@deprecated` is a documentation and tooling signal, not a removal mechanism. Apply steps 4 to 7 field by field and skip the scheme menu. Schema design lives in `api:graphql`.
- **gRPC:** steps 2, 4, and 7 apply unchanged. The version-in-package convention and `buf breaking` gates are in `api:grpc`.
- The paradigm sets the default and does not lock you in. Date-versioned GraphQL APIs exist, and some REST guidelines prefer additive-only evolution.

## 2. Breaking-change definition

Without a written definition, every dispute is a judgment call. Write both lists into the policy.

- **Breaking, needs a new version.** Any change that makes a previously working client fail: removing or renaming a field or endpoint, changing a field's type, removing an enum value, adding a required request parameter, or changing the status code or content type for the same scenario.
- **Non-breaking, ships into the current version.** New resources, new optional request parameters, new response properties, changed property order, changed opaque-string format (such as ID length), and new webhook event types.
- **Open enums.** Declare which enum fields may gain values without a version bump. This moves tolerance onto callers and cuts version churn.
- **Not contractual.** Say what may change without notice: message text, ordering, timing. Hyrum's Law says that with enough users, every observable behavior is depended on, so what you do not declare gets depended on anyway.
- **Security exception.** Reserve the right to patch any version for critical security or privacy issues, and write the exception down instead of invoking an unwritten one.

If you need a breaking change more than about twice a year, the scheme or the compatibility discipline is wrong. Telemetry answers that regardless of how the team feels about the theory.

Error codes and webhook event schemas are contract too. Retiring one follows this policy.

## 3. Choose a scheme (REST)

| Scheme | Fits | Cost |
| --- | --- | --- |
| URI major version (`/v1/users`) | Default. Visible, easy to test and cache, no header knowledge needed. | Low |
| Header version (`YYYY-MM-DD` or `v2`) | Stable URIs, calendar cadence | Low to medium |
| Date-based, account-pinned | Frequent breaking changes and a long tail of integrators you cannot force to migrate | High, maintained forever |
| None, additive-only | A reachable consumer base, strong review discipline, usage telemetry | Permanent: every change must be additive |

- Default to URI major version unless the repo already uses another scheme. Keep the repo's scheme.
- With header versioning, decide what a missing header means. Requiring it and erroring is safer than silently pinning, because a required version cannot drift under a caller.
- Date-pinning means each response is downgraded through per-version transformers, one per historical breaking change. Adopt it only when both promotion conditions hold, not because a large vendor does.
- Strike additive-only when consumers are unreachable and breaking changes already ship quarterly or faster. It promises forever what the change rate already breaks.
- Roy Fielding's objection is that an evolvable API should not need versions, and a path version changes the URL of a resource that did not change. The additive-only rung answers him. The URI default is the pragmatic choice.
- Never serve unversioned access as a fallback. Removing it later is itself a breaking change.

## 4. Notice windows and live versions

Set numbers from the audience. These are common practice, not standards, so treat them as floors and write your own commitment.

- **Public API:** at least 12 months of notice. Go to 24 months or more when consumers ship mobile apps or are enterprises, since app-store cycles and change management are outside your control.
- **Partner or B2B:** put the number in the contract or SLA.
- **Internal:** replace notice periods with consumer-driven contract tests and coordinated deploys.
- **Live versions:** cap at 2 to 3. Each extra version multiplies maintenance, testing, and documentation.
- **The clock:** define when it starts (version release, next version's release, or announcement). Ambiguity becomes a support dispute.
- **Dates are commitments.** A slipped sunset teaches integrators to ignore your dates.

## 5. Communicate the sunset

Deprecation is staged: announce, deprecate (both versions serve, signals live), sunset (date arrives), remove (grace ends). Never jump from announce to removed.

1. Send the `Deprecation` header (RFC 9745, Standards Track, March 2025). The value is a structured-field date, `Deprecation: @1688169599` (Unix seconds). It signals the resource is or will be deprecated and changes no behavior.
2. Add `Sunset` (RFC 8594, Informational) once the date is firm, with an HTTP-date: `Sunset: Thu, 31 Dec 2026 23:59:59 GMT`. RFC 9745 requires the Sunset time to be no earlier than the Deprecation time. Both headers go on the deprecated version's responses.
3. Add `Link` headers (RFC 8288) so tooling finds what to do next. `rel="deprecation"` points to human-readable deprecation docs (RFC 9745), `rel="sunset"` to sunset policy information (RFC 8594), and `rel="successor-version"` to the replacement (RFC 5829). Mark the operation `deprecated: true` in OpenAPI.
4. Do not rely on headers alone. Most integrator tooling ignores them. Add a channel that reaches humans: changelog, dashboard banner, or email to accounts still calling the deprecated version.
5. Own the migration. Publish a migration guide with concrete steps, ship tooling where feasible, and name a support channel. Announcing a sunset and walking away is a failure mode.

```http
HTTP/1.1 200 OK
Deprecation: @1767225600
Sunset: Thu, 31 Dec 2026 23:59:59 GMT
Link: <https://docs.example.com/migrate-v2>; rel="deprecation", <https://api.example.com/v2/users>; rel="successor-version"
```

## 6. Enforce at the sunset date

- **Hard cutoff (default).** The retired version returns `410 Gone` with a descriptive problem-details body (`api:rest-design`) and a successor link. A loud failure is diagnosable.
- **Fall-forward.** Requests naming a retired version are routed to the oldest accessible one. Use it only when silent continuity is genuinely safer than breakage, and document it loudly, because behavior drifts under callers who never noticed.
- Follow the sunset date with a grace period of `410` responses instead of dropping connections.
- Surfaces on one platform can differ. If you split, write both styles into the policy.

## 7. Governance

- **Floor.** Run an OpenAPI diff or linter in CI (oasdiff, Spectral) to flag breaking changes mechanically, and require sign-off from a named engineer for anything flagged.
- **Review board** once the surface outgrows one reviewer. Its useful output is an alternative design that preserves behavior for current customers, not just approve or reject.
- **Program** at platform scale: published guidelines, an enforcing linter, and design review.
- At every stage, no breaking change ships without the governance layer's approval. Business-motivated changes are the ones most tempted to skip it.

## 8. Draft the policy

Offer two or three candidate policies as coherent bundles (scheme, windows, enforcement, governance) with trade-offs and a recommendation. On the user's pick, draft the document section by section from [references/policy-template.md](references/policy-template.md) and confirm each before writing the next. Walking back to an earlier section is normal, so reconcile the sections that depend on it. Get explicit approval of the whole document before calling it final.

## Failure modes

- A version both deprecated and the default.
- Unversioned access allowed.
- Skipping the process for business-driven changes.
- Moving sunset dates.
- Headers-only communication.
- Announce and walk away, with no migration guide.
- Undocumented fall-forward.
- An undefined clock for "supported for 2 years".
- Treating GraphQL `@deprecated` as removal.

## Measure

- Breaking changes per year (target at most about 2).
- Migration by usage, not calendar. A version is removable when telemetry shows zero or a consciously accepted residue of traffic.
- Deprecated-version traffic share after each communication wave. A flat line after a mass email means the channel failed.
- Slipped sunset dates (target 0).

## References

- [references/policy-template.md](references/policy-template.md) - read when drafting the policy document.

Sources checked: RFC 9745 (rfc-editor.org/rfc/rfc9745), RFC 8594 (rfc-editor.org/rfc/rfc8594), IANA link relations registry (successor-version via RFC 5829), graphql.org/learn/schema-design.
