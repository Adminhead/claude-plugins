# Issue body templates

## Slice issue

```markdown
## Parent
#<number> (omit when there is none)

## What to build
The end-to-end behavior this issue makes work, from the user's point of view. Not a layer-by-layer task list.

## Acceptance criteria
- [ ] Observable criterion 1
- [ ] Observable criterion 2

## Blocked by
- #<number>, or "None (can start immediately)"
```

When native blocked-by links exist, set them too. The text keeps the edge visible on older gh and in exported text.

Leave out file paths and line numbers because they go stale. The exception is a snippet that encodes a decision more precisely than prose (a state machine, a schema, a type shape). Inline it and say where it came from.

## Spec issue

Use when the user wants a spec recorded before it is sliced. Synthesize from what the conversation already established.

```markdown
## Problem
The problem from the user's point of view.

## Solution
The solution from the user's point of view.

## User stories
1. As a <actor>, I want <capability>, so that <benefit>

## Implementation decisions
Modules to build or change, their interfaces, schema changes, API contracts, and the reasoning. No file paths.

## Testing decisions
- What a good test checks here (external behavior, not implementation details)
- Which modules get tests, and at which seam
- Prior art: similar tests already in the repo

## Out of scope
What this spec does not cover.
```

Choose test seams before writing the testing section. Reuse an existing seam at the highest level that works, since fewer seams mean fewer fragile tests. Confirm the seams with the user.

## Per-requirement issue

For a spec with numbered requirements, title the issue with the requirement ID and a short description. The body holds the requirement text, how it maps to current code, and acceptance criteria.
