# Nygard ADR format

This is the default format used by this skill. Michael Nygard's original article describes one short (usually 1–2 page) record for a significant architectural decision. Keep the Context neutral: describe the forces and tensions without arguing for the outcome. Write the Decision in active voice, such as “We will …”. Consequences may be positive, negative, or neutral.

The original source describes the sections in this order: Title, Context, Decision, Status, and Consequences. This skill's generator deliberately uses the commonly adopted local order Title, Date, Status, Context, Decision, and Consequences, following adr-tools' `Date:` line. That is a generator convention, not a claim that it mirrors the source order exactly.

## Copyable template

```markdown
# <title>

Date: YYYY-MM-DD

## Status

Proposed

## Context

<Describe the neutral forces, constraints, and tensions that motivate the decision.>

## Decision

We will <state the decision in active voice and make it unambiguous>.

## Consequences

- Positive: <benefit>
- Negative: <cost or trade-off>
- Neutral: <important effect that is neither clearly good nor bad>
```

Use sequential numeric IDs in filenames, never reuse an ID, and retain superseded records. The normal lifecycle is Proposed, Accepted, Deprecated, or Superseded. A superseded record should link to its replacement; preserve the historical record rather than rewriting its rationale or outcome.

## Check for updates

- Primary source: [Michael Nygard, “Documenting Architecture Decisions”](https://www.cognitect.com/blog/2011/11/15/documenting-architecture-decisions)

Review the primary source when revising this reference.
