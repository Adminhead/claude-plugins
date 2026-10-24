---
name: git-history
description: 'Edits and repairs Git history safely without opening an editor: fixup and autosquash, rebasing onto the default branch or a new base, splitting commits, cherry-pick backports, bisect, and reflog recovery. Use when asked to squash or reorder commits, update a branch with main, backport a fix, find a regression, or undo a bad rebase or reset.'
---

# Git history

Rewriting history replaces commits with new ones. That is safe on a private branch and harmful on a shared one, so decide which case you are in before running anything. Creating commits and naming branches belong to `git-commit`.

Adapted in part from awesome-copilot's `rebase-current-branch` (MIT, Copyright GitHub, Inc.) and wshobson/agents `git-advanced-workflows` (MIT, Copyright (c) 2024 Seth Hobson). See `LICENSE`.

## Safety rules

- Rewrite only commits that exist solely on the user's local or personal branch. Check with `git branch --remotes --contains <oldest-commit>` and `git rev-list --count @{u}..HEAD`. Never rewrite the default branch, a release branch, or anything others may have pulled. Use `git revert` there.
- Check for an operation already in progress before starting one: `git status` reports it, or test for `.git/rebase-merge`, `.git/rebase-apply`, `.git/MERGE_HEAD`, `.git/CHERRY_PICK_HEAD` and `.git/BISECT_LOG` (use `git rev-parse --git-path <name>` so worktrees resolve). If one exists, show its state and ask whether to continue or abort. Never start a second one.
- Never stash automatically. If the tree is dirty, stop and ask whether to commit, stash, or leave the operation.
- Never run `git reset --hard` to finish or undo a rewrite; restore through a backup or rescue branch instead. If the user explicitly asks for a hard reset, first show what it discards (`git status --short`, `git log --oneline <target>..HEAD`) and get approval.
- Never push as part of a history operation. When the user separately asks to push rewritten commits, use `git push --force-with-lease=<branch>:<expected-sha>` with the sha you last saw on the remote, never bare `--force`. The lease fails if the remote moved, which is the point.
- These need explicit approval, asked with AskUserQuestion showing the exact command and what would be lost: `git clean`, `git checkout -- <path>` or `git restore` over changes, `git branch -D`, any force push, `git reflog expire`, `git gc --prune`, and a rebase that rewrites already-pushed commits.
- Never open an editor; an interactive command that waits for one hangs the session. Every section below gives an editor-free form.
- Don't skip hooks or change Git config to make an operation pass.

## Before a rewrite

1. `git status --short --branch`. A rebase needs a clean tree (see the stash rule above).
2. Find the default branch from the remote, never by assuming `main` or `master`: `git symbolic-ref --short refs/remotes/origin/HEAD`, else `git ls-remote --symref origin HEAD`, else `git remote show origin`. Prefer the current branch's configured upstream remote over `origin`. If it is still ambiguous, ask.
3. Create a backup ref: `git branch backup/<branch>-<YYYYMMDD>`. Tell the user its name. Delete it only when they confirm the result is good.
4. State the plan: which commits change, the base, and the expected resulting log.

## Update a branch with the default branch

1. Confirm the current branch (`git branch --show-current`) is not the default branch. Never rebase the default branch itself.
2. Fetch only that remote and branch: `git fetch <remote> <default>`, and confirm `<remote>/<default>` exists. Never rebase onto a local `main` that may be stale.
3. Say which branch is being rebased onto which ref, then `git rebase <remote>/<default>`.
4. After it succeeds, offer to run the repo's documented checks (pre-commit, lint, tests) and report results. Don't push.

If the branch is shared or the user prefers merges, `git merge <remote>/<default>` integrates without rewriting.

## Fixup and autosquash

The agent-safe way to amend an earlier commit is a fixup commit, then an autosquash rebase with the todo list auto-accepted.

```bash
git add <paths>
git commit --fixup=<target-sha>            # creates "fixup! <target subject>"
GIT_SEQUENCE_EDITOR=true git rebase -i --autosquash <base>
```

- `GIT_SEQUENCE_EDITOR=true` runs `true` as the editor, so Git accepts the generated todo list; `--autosquash` has already moved each `fixup!` under its target.
- `<base>` is the commit before the oldest one you touch, often `$(git merge-base HEAD <remote>/<default>)`.
- To squash a whole branch into one commit, fixup each later commit into the first, or `git reset --soft <base> && git commit` with approval, since it discards the individual commits.
- Reword the latest commit with `git commit --amend -m "<message>"`. For an older commit, set `GIT_SEQUENCE_EDITOR` to a `sed` that changes its `pick <short-sha>` line to `reword <short-sha>`, and `GIT_EDITOR="cp /path/to/msg"` to supply the prepared message. The todo uses abbreviated shas, so match `git rev-parse --short <sha>`. On macOS `sed -i` needs `''` after it.
- On a conflict, resolve the files, `git add` them, then `GIT_EDITOR=true git rebase --continue`. `git rebase --abort` returns to the start. Don't `--skip` a commit without telling the user which one is dropped, and never discard work to force completion.

## Split a commit

```bash
GIT_SEQUENCE_EDITOR="sed -i -e 's/^pick <short-sha>/edit <short-sha>/'" git rebase -i <sha>^
git reset HEAD^                  # mixed reset: the commit's changes stay in the tree
git add <paths-a> && git commit -m "<first message>"
git add <paths-b> && git commit -m "<second message>"
GIT_EDITOR=true git rebase --continue
```

Confirm the tree is clean before `--continue`; anything left unstaged is carried forward, not lost.

## Move a branch to a new base

```bash
git rebase --onto <new-base> <old-base> <branch>
```

`<old-base>` is the commit your branch currently forks from. Use this to move a branch off a merged parent or lift a sub-branch out of a stack. Add `--update-refs` when branches stacked on this one should move with it. Check with `git log --oneline <new-base>..<branch>` and `git range-diff <old-tip>...<branch>`.

## Cherry-pick and backports

```bash
git cherry-pick -x <sha>             # -x records the source commit in the message
git cherry-pick -x <first>^..<last>  # inclusive range, oldest first
git cherry-pick -n <sha>             # apply to the tree without committing
git cherry-pick --abort              # leave a conflicted pick without changes
```

- Use `-x` for backports so the origin stays traceable. Cherry-pick onto a branch made for the backport, not onto the release branch directly, unless told otherwise. For a merge commit, pass `-m 1`.
- To take only some files from a commit: `git restore --source=<sha> -- <paths>`, then commit with a message naming the source sha.

## Find a regression or recover lost work

Read [references/recovery-and-bisect.md](references/recovery-and-bisect.md) for `git bisect run` and its exit-code rules, reflog recovery, and undoing a bad rebase, reset, merge, or dropped stash.

## Undo something already shared

Don't rewrite. `git revert <sha>` adds an inverting commit, and `git revert -m 1 <merge-sha>` reverts a merge. Say why in the message. If a secret was pushed, rotating it is the fix, because rewriting history doesn't remove copies others already fetched.

## Report

List the backup ref, the commands run, the before and after `git log --oneline`, and anything still needing approval, such as a force push.
