# Schema evolution and deprecation

Read when deciding whether a schema change is breaking, deprecating or removing a field, or writing the GraphQL evolution policy. REST version-and-sunset policy lives in `api-rest-design`, if installed. This file covers the GraphQL side only.

## Default stance: continuous evolution

graphql.org says GraphQL "takes a strong opinion on avoiding versioning by providing the tools for the continuous evolution of a GraphQL schema". Run one live schema:

1. Add the replacement field or type.
2. Mark the old field `@deprecated(reason: "Use newField.")`, naming the replacement in the reason.
3. Measure usage of the deprecated field per client (operation names, persisted-query IDs, or field-level telemetry from the server).
4. Remove the field only when telemetry shows no real consumers, or a residue you accept on purpose, and after any minimum time floor the policy promises.

`@deprecated` is a documentation and tooling signal. It changes no behavior and removes nothing. Treating it as removal is the most common failure.

A date-versioned GraphQL API is legitimate when the change rate and an unreachable consumer base demand it. Choose it deliberately and write it down. Don't drift into it.

## What counts as breaking

Apply the definition per field and write it into the policy so disputes have an answer.

- **Breaking.** Removing or renaming a field, argument, type, or enum value. Changing a field's type, including nullable to non-null on an argument or input field, or non-null to nullable on an output field. Adding a required argument or a required input field. Changing what a field means for the same inputs.
- **Dangerous.** Adding a member to a union or a value to an enum that clients switch on exhaustively. Adding an implementation to an interface. Changing a default argument value. Adding an optional argument or optional input field (graphql-js's `findDangerousChanges` flags these, though they rarely break a client). Ship these with notice, not silently.
- **Safe.** Adding types and output fields. Making an output field non-null where the domain now guarantees it (clients that handled null still work).
- **Open enums.** Declare which enums may gain values without notice, so clients write a default branch.
- **Not contractual.** Error message text, field order in the response, timing. Hyrum's Law says what you leave undeclared gets depended on anyway, so say it.
- **Security exception.** Reserve the right to change any field for a critical security or privacy fix, and write the exception down.

Run a schema diff in CI on every change (for example `graphql-inspector diff` or the registry check of your gateway) and require a named approver for anything flagged breaking or dangerous.

## Communicate

- Put the replacement and, once known, the removal date in the `reason`.
- Publish a changelog entry and a migration note per deprecation. Most clients never read introspection, so reach humans through the changelog, a dashboard notice, or email to clients whose operations still select the field.
- Dates are commitments. A slipped removal date teaches integrators to ignore the next one.

## Policy section (GraphQL variant)

When drafting the API's versioning policy, replace the REST "version scheme" and "support windows" sections with:

```markdown
## Evolution rules
- All changes are additive. Fields, arguments and enum values are deprecated individually with `@deprecated(reason: "...")` naming the replacement.
- Breaking, dangerous and safe changes: [the lists above, plus domain additions].
- Open enums: [list].

## Field rollover
- Deprecation marker, then per-field usage telemetry, then removal only at [zero | accepted residual] observed consumers, and no sooner than [minimum floor, if any] after deprecation.
- Notice through [changelog, dashboard, email] at deprecation and again before removal.

## Governance
- Schema diff in CI: [tool]. No breaking or dangerous change ships without [named approver | review board].
```

Keep the breaking-change definition, communication, governance and measurement sections the same shape as the REST policy so one document can cover both surfaces.

## Measure

- Deprecated-field traffic share after each communication wave. A flat line after an email means the channel failed.
- Breaking changes per year. More than about two means the schema shapes or the review discipline need work.
- Slipped removal dates (target 0).
