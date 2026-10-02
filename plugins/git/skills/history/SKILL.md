---
name: history
description: Edit and repair Git history safely without opening an editor, covering fixup commits with autosquash, rebase onto another base, cherry-pick backports, bisect to find a regression, and recovery of lost commits through the reflog. Use when asked to clean up or reorder commits, squash a branch, move a branch to a new base, backport a fix, find the commit that broke something, or undo a bad rebase, reset, or merge. Not for creating commits (`git:commit`), naming or creating branches (`git:branch`), or worktrees (`git:worktree`).
---

# Git History

Rewriting history replaces commits with new ones. That is safe on a private branch and harmful on a shared one, so decide which case you are in before running anything.

## Approval and safety

- Rewrite only commits that exist solely on the user's local or personal branch. Check with `git branch --remotes --contains <oldest-commit>` and `git rev-list --count @{u}..HEAD`. Never rewrite `main`, a release branch, or anything others may have pulled. Use `git revert` there.
- These need the user's explicit approval, asked with AskUserQuestion that shows the exact command(s) and what would be lost or replaced: `git reset --hard`, `git clean`, `git checkout -- <path>` or `git restore` over changes, `git branch -D`, any force push, `git reflog expire`, `git gc --prune`, and a rebase that rewrites already-pushed commits.
- Never force push with bare `--force`. When the user approves a push of rewritten commits, use `git push --force-with-lease=<branch>:<expected-sha>`, with the sha you last saw on the remote. The lease fails if the remote moved, which is the point.
- Never open an editor. An interactive command that waits for one hangs the session. The sections below give editor-free forms.
- Don't skip hooks or change Git config to make an operation pass.

## Before a rewrite

1. `git status --short --branch`. A rebase needs a clean tree. If it isn't clean, ask whether to commit, or stash with `git stash push` after approval, and say that you will restore it.
2. Create a backup ref so any mistake is one command from undone: `git branch backup/<branch>-<YYYYMMDD>`. Tell the user its name. Delete it only when they confirm the result is good.
3. State the plan: which commits change, the base, and the expected resulting log.

## Fixup and autosquash

The agent-safe way to amend an earlier commit is a fixup commit, then an autosquash rebase with the todo list auto-accepted.

```bash
git add <paths>
git commit --fixup=<target-sha>            # creates "fixup! <target subject>"
GIT_SEQUENCE_EDITOR=true git rebase -i --autosquash <base>
```

- `GIT_SEQUENCE_EDITOR=true` runs the `true` command as the editor, so Git accepts the todo list as generated. `--autosquash` has already moved each `fixup!` under its target.
- `<base>` is the commit before the oldest commit you want to touch, often `$(git merge-base HEAD origin/<default>)` or `origin/<default>`.
- To squash a whole branch into one commit, fixup each later commit into the first, or use `git reset --soft <base> && git commit` with approval, since it discards the individual commits.
- Reword the latest commit with `git commit --amend -m "<message>"`. To reword an older commit, set `GIT_SEQUENCE_EDITOR` to a `sed` that changes that commit's `pick <sha>` line to `reword <sha>`, and set `GIT_EDITOR` to a command that copies your prepared message file over the one Git hands it, for example `GIT_EDITOR="cp /path/to/msg"`. Git also rejects `-m` together with `--fixup=reword:`.
- If the rebase stops on a conflict, resolve the files, `git add` them, then continue with `GIT_EDITOR=true git rebase --continue` so no message editor opens. Use `git rebase --abort` to return to the start. Don't `--skip` a commit without telling the user which one is dropped.

## Move a branch to a new base

```bash
git rebase --onto <new-base> <old-base> <branch>
```

`<old-base>` is the commit your branch currently forks from. Commits after it replay onto `<new-base>`. Use this to move a branch off a merged parent, or to lift a sub-branch out of a stack. Add `--update-refs` when branches stacked on this one should move with it. Check the result with `git log --oneline <new-base>..<branch>` and `git range-diff <old-tip>...<branch>`.

## Cherry-pick and backports

```bash
git cherry-pick -x <sha>             # -x records the source commit in the message
git cherry-pick -x <first>^..<last>  # inclusive range, oldest first
git cherry-pick --abort              # leave a conflicted pick without changes
```

Use `-x` for backports to release branches so the origin stays traceable. Cherry-pick onto a branch created for the backport, not onto the release branch directly, unless the user says otherwise. For a merge commit, pass `-m 1`.

## Find a regression with bisect

Read [recovery and bisect](references/recovery-and-bisect.md) for automated `git bisect run`, exit-code rules, and cleanup.

## Recover lost work

Read [recovery and bisect](references/recovery-and-bisect.md) for reflog recovery, undoing a bad rebase, reset, or merge, and finding dropped stashes.

## Undo something already shared

Don't rewrite. `git revert <sha>` adds a commit that inverts the change, and `git revert -m 1 <merge-sha>` reverts a merge. The revert message should say why. If a secret was pushed, rotating it is the fix, because rewriting history doesn't remove copies others have already fetched.

## Report

List the backup ref, the commands run, the before and after `git log --oneline`, and anything still needing approval, such as a force push.
