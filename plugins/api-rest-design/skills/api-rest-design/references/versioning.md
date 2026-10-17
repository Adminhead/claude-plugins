# REST versioning and deprecation policy

Read this when planning a `/v2`, retiring a version, deciding whether a change is breaking, or writing a deprecation policy or timeline for API consumers.

Choosing a scheme is the easy half. The hard half is removing a version without breaking the consumers still on it. A policy answers five questions in writing: which scheme carries the version, what counts as breaking, how long consumers get, how you tell them and enforce the end, and who signs off on breaking anything.

Scope: REST version-and-sunset. A GraphQL schema evolves continuously (`@deprecated` per field, removal at zero observed usage), which is `api-graphql`'s policy, if installed. gRPC package versioning and `buf breaking` gates belong to `api-grpc`, if installed, though steps 2, 4 and 7 here apply to it unchanged. Client SDK versioning is plain SemVer and out of scope.

## Gather the inputs

Ask the user only what the repo cannot answer.

1. Audience: internal, partner under contract, or public? This sets the notice period more than anything else.
2. Current state: greenfield, one unversioned live API, or several versions already live? Is any version both deprecated and still the default?
3. Breaking-change pressure: how many breaking changes shipped or were blocked in the past year?
4. Reachability: can you identify and contact every consumer? Do any ship mobile apps or run enterprise change management?
5. Deadline and horizon: is this retiring one version or a policy the platform will run for years?

## 1. Breaking-change definition

Without a written definition, every dispute is a judgment call. Write both lists into the policy.

- **Breaking, needs a new version.** Any change that makes a previously working client fail: removing or renaming a field or endpoint, changing a field's type, removing an enum value, adding a required request parameter, or changing the status code or content type for the same scenario.
- **Non-breaking, ships into the current version.** New resources, new optional request parameters, new response properties, changed property order, changed opaque-string format (such as ID length), and new webhook event types.
- **Open enums.** Declare which enum fields may gain values without a version bump. This moves tolerance onto callers and cuts version churn.
- **Not contractual.** Say what may change without notice: message text, ordering, timing. Under Hyrum's Law, what you do not declare gets depended on anyway.
- **Security exception.** Reserve the right to patch any version for critical security or privacy issues, and write the exception down instead of invoking an unwritten one.

If you need a breaking change more than about twice a year, the scheme or the compatibility discipline is wrong. Error codes and webhook event schemas are contract too, and retiring one follows this policy.

## 2. Choose a scheme

| Scheme | Fits | Cost |
| --- | --- | --- |
| URI major version (`/v1/users`) | Default. Visible, easy to test and cache, no header knowledge needed. | Low |
| Header version (`YYYY-MM-DD` or `v2`) | Stable URIs, calendar cadence | Low to medium |
| Date-based, account-pinned | Frequent breaking changes and a long tail of integrators you cannot force to migrate | High, maintained forever |
| None, additive-only | A reachable consumer base, strong review discipline, usage telemetry | Permanent: every change must be additive |

- Default to URI major version unless the repo already uses another scheme. Keep the repo's scheme.
- With header versioning, decide what a missing header means. Requiring it and erroring is safer than silently pinning, because a required version cannot drift under a caller.
- Date-pinning means each response is downgraded through per-version transformers, one per historical breaking change. Adopt it only when both conditions in its row hold, not because a large vendor does.
- Strike additive-only when consumers are unreachable and breaking changes already ship quarterly or faster. It promises forever what the change rate already breaks.
- Never serve unversioned access as a fallback. Removing it later is itself a breaking change.

## 3. Notice windows and live versions

These numbers are common practice, not standards. Treat them as floors and write your own commitment.

- **Public API:** at least 12 months of notice. Go to 24 months or more when consumers ship mobile apps or are enterprises.
- **Partner or B2B:** put the number in the contract or SLA.
- **Internal:** replace notice periods with consumer-driven contract tests and coordinated deploys.
- **Live versions:** cap at 2 to 3. Each extra version multiplies maintenance, testing, and documentation.
- **The clock:** define when it starts (version release, next version's release, or announcement). Ambiguity becomes a support dispute.
- **Dates are commitments.** A slipped sunset teaches integrators to ignore your dates.

## 4. Communicate the sunset

Deprecation is staged: announce, deprecate (both versions serve, signals live), sunset (date arrives), remove (grace ends). Never jump from announce to removed.

1. Send the `Deprecation` header (RFC 9745, Standards Track, March 2025). The value is a structured-field date, `Deprecation: @1688169599` (Unix seconds). It signals the resource is or will be deprecated and changes no behavior.
2. Add `Sunset` (RFC 8594, Informational) once the date is firm, with an HTTP-date: `Sunset: Thu, 31 Dec 2026 23:59:59 GMT`. RFC 9745 requires the Sunset time to be no earlier than the Deprecation time. Both headers go on the deprecated version's responses.
3. Add `Link` headers (RFC 8288) so tooling finds what to do next. `rel="deprecation"` points to human-readable deprecation docs (RFC 9745), `rel="sunset"` to sunset policy information (RFC 8594), and `rel="successor-version"` to the replacement (RFC 5829). Mark the operation `deprecated: true` in OpenAPI.
4. Do not rely on headers alone. Most integrator tooling ignores them. Add a channel that reaches humans: changelog, dashboard banner, or email to accounts still calling the deprecated version.
5. Own the migration. Publish a migration guide with concrete steps, ship tooling where feasible, and name a support channel.

```http
HTTP/1.1 200 OK
Deprecation: @1767225600
Sunset: Thu, 31 Dec 2026 23:59:59 GMT
Link: <https://docs.example.com/migrate-v2>; rel="deprecation", <https://api.example.com/v2/users>; rel="successor-version"
```

## 5. Enforce at the sunset date

- **Hard cutoff (default).** The retired version returns `410 Gone` with a problem-details body (errors.md) and a successor link. A loud failure is diagnosable.
- **Fall-forward.** Requests naming a retired version are routed to the oldest accessible one. Use it only when silent continuity is genuinely safer than breakage, and document it loudly, because behavior drifts under callers who never noticed.
- Follow the sunset date with a grace period of `410` responses instead of dropping connections.

## 6. Governance

- **Floor.** Run an OpenAPI diff in CI (oasdiff, or a Spectral ruleset) to flag breaking changes mechanically, and require sign-off from a named engineer for anything flagged.
- **Review board** once the surface outgrows one reviewer. Its useful output is an alternative design that preserves behavior for current customers, not just approve or reject.
- At every stage, no breaking change ships without the governance layer's approval. Business-motivated changes are the ones most tempted to skip it.

## 7. Draft the policy

Offer two or three candidate policies as coherent bundles (scheme, windows, enforcement, governance) with trade-offs and a recommendation. On the user's pick, draft the document section by section from versioning-policy-template.md and confirm each before writing the next. Reconcile dependent sections when the user walks back an earlier one, and get explicit approval of the whole document before calling it final.

## Failure modes

- A version both deprecated and the default.
- Unversioned access allowed.
- Skipping the process for business-driven changes.
- Moving sunset dates.
- Headers-only communication.
- Announce and walk away, with no migration guide.
- Undocumented fall-forward.
- An undefined clock for "supported for 2 years".

## Measure

- Breaking changes per year (target at most about 2).
- Migration by usage, not calendar. A version is removable when telemetry shows zero or a consciously accepted residue of traffic.
- Deprecated-version traffic share after each communication wave. A flat line after a mass email means the channel failed.
- Slipped sunset dates (target 0).

Sources checked: RFC 9745 (rfc-editor.org/rfc/rfc9745, rechecked 2026-10-17: Standards Track, March 2025), RFC 8594, IANA link relations registry (successor-version via RFC 5829).
