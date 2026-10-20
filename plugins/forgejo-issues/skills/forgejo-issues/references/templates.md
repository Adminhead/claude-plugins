# Issue body templates

Use the repo's own templates when they exist (`fj issue templates` lists them). Forgejo reads issue templates from the repo, commonly under `.forgejo/issue_template/` or `.gitea/issue_template/`; the exact locations are unverified here, so trust `fj issue templates` over a path guess. Otherwise pick the closest shape below and drop empty sections.

## Bug

```markdown
## Summary
One sentence on what breaks.

## Steps to reproduce
1. ...

## Expected
...

## Actual
...

## Environment
Version, OS, config that matters.
```

## Feature

```markdown
## Problem
Who is blocked, and why it matters.

## Proposed behavior
What changes from the user's point of view.

## Acceptance criteria
- [ ] ...
```

## Task

```markdown
## Goal
The outcome, in one or two sentences.

## Scope
- ...

## Done when
- [ ] ...
```

Link related work with `Related to #123`, or with `fj issue depend` / `fj issue block` when the link carries meaning such as "blocked by". Write context that stays true: skip file paths and line numbers that will go stale.
