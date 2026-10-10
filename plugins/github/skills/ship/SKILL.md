---
name: ship
description: "Ship finished work in one run: commit it, push the branch, and optionally open a ready PR, wait for checks, and merge it. Use when asked to \"commit and push\", \"push this up\", \"send it\", \"ship it\", \"commit, push, open a PR, and merge it\", or to get the current changes onto GitHub. Takes an optional level argument (push, pr, or merge). Stops at a failed check or a rejected push. Not for writing or improving a PR body (`github:pr`), commit-only requests (`git:commit`), or acting on review comments (`github:pr-comments`)."
argument-hint: "[push|pr|merge]"
---

# Ship

Carry current work through commit, push, and optionally PR and merge. The request is the authorization for every step at the chosen level, so don't pause for approval between steps. Stop and report when a gate fails.

## Level

Use the argument if given. Otherwise infer it from the wording and take the lowest level that covers the request.

| Level | Request sounds like | Steps |
| --- | --- | --- |
| `push` | "commit and push" | commit, push |
| `pr` | "commit, push, and open a PR" | commit, push, open PR, watch checks |
| `merge` | "...then merge it" | all of the above, then merge |

## Never

- Force-push, rebase, amend, reset, or stash.
- Pass `--no-verify`, `--admin`, or any flag that skips hooks or branch protection.
- Open a PR from the default branch. At `pr` or `merge` level, branch off first (step 1).

## Steps

1. **Branch.** At `push` level, stay on the current branch, including the default branch; the request authorizes it. At `pr` or `merge` level on the default branch, create a branch named by the repo's convention (`git:branch`, if installed) and carry the working changes onto it.
2. **Commit.** Run `git status --short --branch`, `git diff`, `git diff --staged`, and `git log --oneline -15`. Use the repo's message convention (`git:commit`, if installed, holds the rules; otherwise match recent history and use Conventional Commits). Stage explicit paths, leave unrelated or sensitive files out, and report them. Commit and let hooks run. If a hook fails, fix what it reports and make a new commit. With nothing to commit and unpushed commits ahead, go on to push.
3. **Push.** Run `git push`, or `git push -u origin <branch>` when no upstream exists. On a non-fast-forward rejection, stop and report. Don't rebase to make it fit. If branch protection rejects a push to the default branch, stop and offer the `pr` level.
4. **Open the PR** (`pr`, `merge`). If the branch already has one (`gh pr list --head <branch>`), reuse it. Otherwise run `gh pr create --base <default> --title ... --body-file ...` as a ready PR. Title in the repo's convention. Body follows `github:pr` (if installed), else a short summary and the test evidence you ran. Then run `gh pr checks --watch`.
5. **Merge** (`merge`), only when every check passed. No checks configured counts as passing.
   - Pick the method from `gh repo view --json squashMergeAllowed,mergeCommitAllowed,rebaseMergeAllowed`, preferring squash.
   - Run `gh pr merge --<method> --delete-branch`. A branch-protection refusal is a stop, not a reason to retry with flags.
   - Switch to the default branch and fast-forward it (`git switch <default>`, `git pull --ff-only`). In a linked worktree where the default branch is checked out elsewhere, skip the switch and report it. Don't remove the worktree.
6. **On failed checks,** stop. Summarize `gh run view <id> --log-failed` and offer to fix it (`github:actions`, if installed, for workflow problems).

## Report

Commit SHA(s), branch, PR URL, check result, merge result, and any files left uncommitted. Name the step that stopped the run and why.
