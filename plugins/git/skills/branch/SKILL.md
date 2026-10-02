---
name: branch
description: Name, validate, and create Git branches from the right base, following the repository's own naming convention, and choose or explain a branching strategy (GitHub flow, trunk-based, GitFlow). Use when asked to create or name a branch, check a branch name, rename or tidy branches, or decide where a branch starts and merges. Not for commits (`git:commit`), history rewriting or recovery (`git:history`), worktree checkouts (`git:worktree`), or pushing and opening PRs (`commit-commands:commit-push-pr`, if installed).
---

# Git Branch

Create branches whose names and base match the repository's conventions. Creating a local branch is cheap and reversible. Pushing, renaming a shared branch, or deleting one is not, so those need the user's approval.

## Inspect first

Run these together and report what you find:

```bash
git status --short --branch
git branch --all --sort=-committerdate | head -30
git log --oneline -10
```

Find the naming convention in this order:

1. Local instructions (CLAUDE.md, CONTRIBUTING) and branch rules in repo or hosting settings.
2. Tooling that parses names, such as release workflows, commitlint, or CI filters on `branches:`.
3. The prefixes in recent branches, when one pattern clearly dominates.
4. The default below.

Uncommitted changes carry across `git switch -c`. Keep them there only if they belong on the new branch. If they don't, tell the user and ask before stashing or committing them.

## Name

Default format is `<type>/<description>`, or `<type>/<issue>-<description>` when an issue exists, so the tracker links to the branch.

```text
feat/user-authentication
fix/87-login-race-condition
docs/api-reference-update
```

- Use the same type words as the commit convention in `git:commit`, so a `feat/` branch carries `feat:` commits. Where the repo uses `feature/` and `bugfix/`, follow it.
- Write the description in lowercase kebab-case, two to five words, and keep the whole name near 50 characters so UIs don't truncate it.
- Use only `a-z`, `0-9`, `-`, and `/`. Allow a dot only where the repo versions release branches (`release/v1.2.0`). Avoid consecutive or leading and trailing hyphens.
- Leave out `worktree`, the author's name, and dates. A worktree is a local checkout, and the name would leak into the remote.
- Never reuse a trunk name (`main`, `master`, `develop`) for a topic branch.
- Validate with `git check-ref-format --branch <name>`. It catches illegal Git names but not convention breaks, so compare against the rules above too.

## Pick the base

Find the default branch without changing local refs:

```bash
git ls-remote --symref origin HEAD     # ref: refs/heads/<default>  HEAD
git symbolic-ref --short refs/remotes/origin/HEAD   # offline; fails if origin/HEAD was never set
```

Branch from the default branch unless the user or the strategy says otherwise (see [strategies](references/strategies.md) for the branch-from and merge-to table). Stacked work branches from its parent branch. A hotfix branches from the release or production ref it patches.

## Create

```bash
git fetch origin <base>
git switch -c <type>/<description> --no-track origin/<base>
```

`--no-track` matters. Without it, a branch started from `origin/<base>` tracks `<base>`, and a later plain `git push` fails or targets the wrong ref. Push once with `git push -u origin <name>` when the user asks.

If the base is a local branch with unpushed commits, say so and confirm before branching from it.

Report the branch name, its base commit, and whether the working tree carried changes.

## Rename and delete

- Rename a local, unpublished branch with `git branch -m <old> <new>`. For a published branch, renaming means a push and a remote delete, so ask first and warn that open PRs on the old name close.
- Delete a merged local branch with `git branch -d`, which refuses unmerged work. Use `-D` or delete a remote branch only on explicit request, after showing what commits would become unreachable (`git log <base>..<branch> --oneline`).
- Bulk cleanup of stale branches is a list for the user to approve, not a loop to run.

## Choose a strategy

Read [strategies](references/strategies.md) when the user asks which model to use, when a branch's base is unclear, or when the repo uses `develop` or release branches. Default to the model the repo already follows. Most repos are trunk-based or GitHub flow, and GitFlow is worth proposing only for scheduled, versioned releases.
