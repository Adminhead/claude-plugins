# Policy document template

The deliverable is one document that integrators and internal teams can both read. Every bracket is a decision from the inputs and steps in SKILL.md, not a default to copy. Confirm sections in this order, since each depends on the ones before: scope, scheme, breaking-change definition, windows, process, enforcement, governance, measurement.

```markdown
# [Product] API versioning and deprecation policy

## Scope
- Covered: [REST /vN endpoints | GraphQL schema | webhook event schemas].
- Not covered, and why: [for example unversioned admin endpoints that "may change at any time"].
- Client SDKs version separately under SemVer: [location of SDK policy].

## Version scheme
- Scheme: [URI major | header | date-pinned | additive-only].
- When no version is specified: [error (recommended) | pinned account version]. Unversioned access is not served.
- Release cadence: [as needed | quarterly].

## Breaking-change definition
- Breaking: removing or renaming a field or endpoint, changing a type, removing an enum value, adding a required parameter, changing status code or content type for a scenario, [domain additions].
- Non-breaking: new resources, optional parameters, response properties, property order, opaque-string format, new event types, new values in open enums: [list open enums].
- Not contractual: message text, field order, timing, [others].
- Security exception: any version may be patched for critical security or privacy fixes, announced via [channel].

## Support windows
- Each version is supported at least [12 | 24] months from [its release | the next version's release | the deprecation announcement].
- At most [2-3] versions are live at once.
- Announced sunset dates are firm. Partner windows live in the SLA.

## Deprecation process
Announce, deprecate, sunset, remove. No jumping from announce to removed.
- Announce through [changelog, dashboard, email] at least [window] before sunset.
- Deprecate with the `Deprecation` header (RFC 9745) on every response of the version, `Sunset` (RFC 8594) once the date is firm, `Link` relations `deprecation`, `sunset`, and `successor-version`, and `deprecated: true` in OpenAPI.
- Targeted outreach to accounts still calling the version at [T-6 months, T-3 months, T-1 month].
- Migration support: a guide per transition, [tooling], [support channel].

## Enforcement at sunset
- [Hard cutoff: `410 Gone` with a problem-details body and successor link | fall-forward to the oldest accessible version, documented here].
- Grace period of [30 days] of `410` before full removal.

## Governance
- Breaking-change detection: [tool] in CI on every spec change.
- Approval: no breaking change ships without [named approver | review board].
- [Charter location, office hours, escalation path.]

## Measurement
- Breaking changes per year (target at most [2]).
- Deprecated-version traffic share, reviewed [monthly] during a deprecation.
- Versions removed only at [zero | accepted residual] traffic.
- Slipped sunset dates (target 0).
```

## GraphQL variant

For continuous evolution, replace "Version scheme" and "Support windows" with:

- **Evolution rules.** All changes are additive. Fields are deprecated individually with `@deprecated(reason: "...")` naming the replacement field.
- **Field rollover.** Deprecation marker, then usage telemetry per deprecated field, then removal only at zero observed consumers, with [a minimum time floor, if any].

The breaking-change definition (applied per field), communication, governance, and measurement keep the same shape.
