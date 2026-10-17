# Issue body templates

Use the repo's `.github/ISSUE_TEMPLATE/` when it exists. Otherwise pick the closest shape below and drop empty sections.

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

Link related work with `Related to #123`, or with a native relationship ([api](api.md)) when the link carries meaning such as "blocked by". Write context that stays true: skip file paths and line numbers that will go stale.
