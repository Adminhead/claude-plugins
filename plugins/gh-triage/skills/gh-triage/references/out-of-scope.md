# The .out-of-scope knowledge base

`.out-of-scope/` at the repo root records rejected enhancement requests. It keeps the reasoning after the issue closes and lets triage surface a prior decision when the same request returns. Creating or editing these files is a repo change, so show the file and get approval, and commit only when asked.

## Layout

One file per concept, not per issue, with a short kebab-case name that says what was rejected: `dark-mode.md`, `plugin-system.md`.

```markdown
# Dark mode

This project does not support user-facing theming.

## Why this is out of scope
The substantive, durable reason: project scope, a technical constraint, or a strategic choice.
A temporary reason ("too busy now") is a deferral, so it doesn't belong here.

## Prior requests
- #42: "Add dark mode support"
- #87: "Night theme for accessibility"
```

Write it like a short design note. Examples and code snippets are welcome when they make the reasoning clear to a stranger.

## When to read it

During the gather step of every triage, read all files. Match by concept, not keyword: "night theme" matches `dark-mode.md`. On a match, tell the maintainer which file it resembles and why it was rejected, then ask whether they still agree. They can:

- Confirm: append the new item to "Prior requests", then close it.
- Reconsider: delete or update the file, and triage the item normally.
- Disagree: the items are related but distinct, so triage normally.

## When to write it

Write only when an enhancement (issue or PR) is rejected as `wontfix`. Never write for a bug, and never for something closed because it already exists. Recording a built feature as rejected would poison later matches.

Flow: check for an existing file, then append to it or create one, then post a comment that explains the decision and mentions the file, then close.

If the maintainer later changes their mind, delete the file. Old issues stay closed as history.
