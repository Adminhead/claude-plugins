# git

Adds four Git skills. One plans and creates focused commits in the repository's own message convention, one names and creates branches, one edits and repairs history, and one manages `git worktree` checkouts. `git:commit` and `git:worktree` replace the user-level `git-*` skills. Version 0.2.0 added `git:branch` and `git:history`. Version 0.2.1 retuned the `git:commit` description so it also loads for message-only requests. Version 0.2.2 points push, PR, and merge requests to `github:ship`. Version 0.2.3 defaults manual worktrees to `.claude/worktrees/<name>`, checks that the path is gitignored, and sends session and subagent isolation to the built-in tools first. Version 0.2.4 recommends `worktree.baseRef: "head"`, because the default `"fresh"` branches worktrees from `origin/HEAD` and drops unpushed commits.

## What it adds

| Skill | Replaces | Purpose |
| --- | --- | --- |
| `git:commit` | `git-commit` | Plan and create focused commits that follow the repository's message convention, including release-please and commitlint Conventional Commits. Also splits changes and drafts or fixes messages |
| `git:branch` | New | Name, validate, and create branches from the right base in the repository's own naming convention, and choose or explain a branching strategy (GitHub flow, trunk-based, GitFlow) |
| `git:history` | New | Edit and repair history without opening an editor: fixup and autosquash, rebase onto a new base, cherry-pick backports, bisect, and recovery of lost commits through the reflog |
| `git:worktree` | `git-worktree` | Create, list, inspect, lock, repair, prune, and remove worktrees with `git worktree`, without losing branches or local work |

Old bare names no longer work. Use the `git:` prefix. `git:branch` and `git:history` are new and have no earlier names.

## Requirements

- `git` on `PATH`.

## Install

```
claude plugin marketplace add /path/to/claude-plugins
claude plugin install git@adminhead
```

To try it without installing:

```
claude --plugin-dir plugins/git
```

## Verify

1. Validate the plugin.
   ```
   claude plugin validate --strict plugins/git
   ```
2. Start a fresh session. The skill list should show `git:commit`, `git:branch`, `git:history`, and `git:worktree`.

## Limits

- `git:commit` creates commits only. It does not push, amend, rebase, reset, stash, skip hooks, or change Git config. A dry-run or message-only request stages nothing.
- `git:commit` is not for pushing, opening PRs, or merging (use `github:ship`, if installed) or for rewriting history (use `git:history`).
- `git:branch` creates local branches freely. Pushing, renaming a shared branch, and deleting a branch need your approval. Uncommitted changes carry over to the new branch, so it asks before stashing or committing them.
- `git:history` rewrites only commits that exist on your local or personal branch. It never rewrites `main`, a release branch, or anything others may have pulled, and uses `git revert` there.
- `git:history` asks for explicit approval, with the exact command and what would be lost, before `git reset --hard`, `git clean`, `git restore` over changes, `git branch -D`, any force push, `git reflog expire`, `git gc --prune`, or a rebase of pushed commits. Approved force pushes use `--force-with-lease` with the expected sha, never bare `--force`.
- `git:history` creates a backup ref (`backup/<branch>-<date>`) before a rewrite, never opens an editor, and does not skip hooks or change Git config.
- `git:worktree` is not for isolating Claude's own session (`EnterWorktree`, `ExitWorktree`, or `claude --worktree`) or a subagent (`Agent` with `isolation: "worktree"`). It covers what those can't: an existing branch, a detached inspection checkout, a worktree you ask for, audit, cleanup, locking, and repair.
- `git:worktree` honors a path you name and otherwise creates worktrees at `.claude/worktrees/<name>`. Before the first one in a repo it checks that the path is ignored and, if not, appends `.claude/worktrees/` to `.gitignore` and tells you. `EnterWorktree` prompts for approval on a path outside `.claude/worktrees/`.
- `git:worktree` removes with `git worktree remove`, never `rm -rf`. It stops and asks if a worktree is dirty, locked, or may hold unmerged work, and it keeps the branch unless you ask to delete it.
- Overlap with `commit-commands:commit` from the official plugin. The skill descriptions separate their scope, but routing between the two is not settled. In a smoke test, "Commit my work." committed without loading `git:commit`. In the 0.2.1 trigger evals, short commit requests loaded `git:commit` in every run. To force it, ask for `git:commit` by name.

## Disable or uninstall

| Task | Command |
| --- | --- |
| Disable | `claude plugin disable git@adminhead` |
| Uninstall | `claude plugin uninstall git@adminhead` |

The plugin ships only skills, so both commands remove them. Start a new session to be sure they are gone.
