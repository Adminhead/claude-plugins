---
name: worktree
description: Manage Git worktrees directly with `git worktree` to create a checkout for a branch, list and inspect worktrees, lock or repair them, prune stale metadata, and remove finished ones without losing branches or local work. Use when the user asks to add, list, clean up, or fix git worktrees. Not for isolating your own session (EnterWorktree/ExitWorktree) or a subagent (Agent isolation "worktree"), or for creating and naming branches (`git:branch`).
---

# Git Worktree

Worktrees are parallel checkouts of one repository. Each has its own files and index, but refs, objects, hooks, and most config are shared.

## Claude Code tools versus this skill

- To isolate a subagent that writes files, pass `isolation: "worktree"` to Agent.
- To move this session into an isolated checkout, use EnterWorktree and leave with ExitWorktree, or launch with `claude --worktree <name>`. Use it only when the user or CLAUDE.md asks for a worktree.
- These create `.claude/worktrees/<name>`, the only location Claude Code supports.
- They branch from the base in the `worktree.baseRef` setting. Recommend `"head"`, which branches from local `HEAD`. The default, `"fresh"`, branches from `origin/HEAD`, so the worktree silently lacks every unpushed commit and its work diverges from the local branch it should merge into. Neither setting carries uncommitted changes, so commit them first.
- Use this skill for what the built-ins can't do: an existing branch, a detached inspection checkout, a user-requested worktree, auditing existing ones, cleanup, locking, and repair. To work inside a worktree you created with `git worktree add`, enter it with EnterWorktree `path`. EnterWorktree prompts for approval when the path is outside `.claude/worktrees/`, so keep manual worktrees there.

## Safety defaults

- Inspect before changing anything. Never switch the main worktree's branch or assume it is clean.
- `--force`, `-B`, removing a dirty worktree, deleting a branch, bulk cleanup, and `rm -rf` all need explicit approval. Ask with AskUserQuestion, show the exact command(s), and say what would be lost.
- Never create a second checkout of a branch already checked out elsewhere. Pick another branch or ask.
- Don't copy `.env`, credentials, keys, or other ignored files into a new worktree without authorization.
- Removing a worktree keeps its branch. Delete a branch only on request, after checking it is merged or otherwise safe to lose.

## Discover

```bash
git rev-parse --is-bare-repository --git-common-dir
git rev-parse --show-toplevel    # fails in a bare repo
git worktree list            # human summary
git worktree list --porcelain  # paths, HEADs, branches, locked/prunable flags
git status --short --branch
```

- A bare repo has no top level. Use its common dir and `git worktree list`.
- Treat submodules as separate repositories, not worktrees of the superproject.
- A dirty worktree is never a reason to stash, reset, or clean it.

## Create

1. Path: honor an explicit path from the user. Otherwise use `.claude/worktrees/<name>`, naming the directory after the branch with `/` replaced by `-` (`feat/user-auth` becomes `feat-user-auth`) so `git worktree list` reads against branch names. Keep the word `worktree` out of the branch name itself. Before creating the first worktree in a repo, run `git check-ignore -q .claude/worktrees/`. If the path isn't ignored, append `.claude/worktrees/` to `.gitignore` and tell the user.
2. Confirm the path doesn't exist or is empty and isn't already a worktree.
3. State the branch and start point, then run one of:
   - New branch: `git worktree add -b <branch> <path> <start-point>`
   - Existing local branch: `git worktree add <path> <branch>`
   - Throwaway inspection: `git worktree add --detach <path> <commit>` (needs a branch before ordinary commits)
   - Remote branch: `git worktree add --track -b <local> <path> <remote>/<branch>`, with the remote named explicitly
4. Verify with `git worktree list` and report the absolute path, branch, and start point.

## Work inside a worktree

- Run Git with `git -C <path>` or from inside the worktree, and confirm the branch before editing or committing.
- Don't change shared config to customize one worktree. If per-worktree config is truly needed, explain the impact and use `extensions.worktreeConfig` with `git config --worktree`.
- Dependencies, build outputs, ports, and ignored local config may need per-worktree setup. Follow the repo's setup docs and ask before installing, copying config, or starting services.
- Multiple worktrees with submodules is incompletely supported by Git. Follow the repo's documented procedure.

## Lock, repair, prune

- `git worktree lock <path> --reason "<why>"` protects a worktree on removable storage or one that must not be pruned. Unlock when that no longer applies.
- After a manual move, confirm the paths and run `git worktree repair [<path>...]`. Never hand-edit `.git/worktrees/`.
- Run `git worktree prune --dry-run --verbose` first. Prune for real only after reviewing the list. Pruning clears stale metadata, not real worktrees.

## Remove

1. Identify the exact linked worktree. Never target the main one.
2. Check `git -C <path> status --short`, its branch, and whether that branch is merged (`git branch --merged <base>`). Stop and ask if it is dirty, locked, ambiguous, or holds work that may matter.
3. Run `git worktree remove <path>`, never `rm -rf`.
4. Confirm the path is gone from `git worktree list`.
5. Keep the branch unless deletion was requested. Then prefer `git branch -d` (refuses unmerged) over `-D`.

## Report

List paths, branches, start points, and commands run. Name any worktrees, branches, dirty files, or locks you deliberately left alone.
