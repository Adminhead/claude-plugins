# git

Adds two Git skills: one plans and creates focused commits in the repository's own message convention, the other manages `git worktree` checkouts. Both replace the user-level `git-*` skills.

## What it adds

| Skill | Replaces | Purpose |
| --- | --- | --- |
| `git:commit` | `git-commit` | Plan and create focused commits that follow the repository's message convention, including release-please and commitlint Conventional Commits. Also splits changes and drafts or fixes messages |
| `git:worktree` | `git-worktree` | Create, list, inspect, lock, repair, prune, and remove worktrees with `git worktree`, without losing branches or local work |

Old bare names no longer work. Use the `git:` prefix.

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
2. Start a fresh session. The skill list should show `git:commit` and `git:worktree`.

## Limits

- `git:commit` creates commits only. It does not push, amend, rebase, reset, stash, skip hooks, or change Git config. A dry-run or message-only request stages nothing.
- `git:commit` is not for pushing or opening PRs (use `commit-commands:commit-push-pr`, if installed) or for rewriting history.
- `git:worktree` is not for isolating Claude's own session (`EnterWorktree` and `ExitWorktree`) or a subagent (`Agent` with `isolation: "worktree"`). It does cover worktrees you ask for at a chosen path.
- `git:worktree` removes with `git worktree remove`, never `rm -rf`. It stops and asks if a worktree is dirty, locked, or may hold unmerged work, and it keeps the branch unless you ask to delete it.
- Overlap with `commit-commands:commit` from the official plugin. The skill descriptions separate their scope, but routing between the two is not settled. In a smoke test, "Commit my work." committed without loading `git:commit`. Evals are still measuring this. To force it, ask for `git:commit` by name.

## Disable or uninstall

| Task | Command |
| --- | --- |
| Disable | `claude plugin disable git@adminhead` |
| Uninstall | `claude plugin uninstall git@adminhead` |

The plugin ships only skills, so both commands remove them. Start a new session to be sure they are gone.
