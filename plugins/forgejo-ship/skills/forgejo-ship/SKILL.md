---
name: forgejo-ship
description: "Ships finished work on a Forgejo or Codeberg repo in one run: commits, pushes, and optionally opens a ready PR with fj, waits for checks and merges. User-run only (/forgejo-ship); agents delegate to forgejo-shipper:forgejo-shipper only when the user explicitly asked in this conversation for that level (push, pr or merge). Takes an optional level: push, pr or merge. Not for github.com (`ship`)."
argument-hint: "[push|pr|merge] [context for the commit message]"
context: fork
agent: forgejo-shipper:forgejo-shipper
background: false
disable-model-invocation: true
---

# Forgejo ship

Carry current work through commit, push, and optionally PR and merge on a Forgejo or Codeberg repo. The user's explicit request for the chosen level is the authorization for every step at that level, so don't pause for approval between steps. Stop and report when a gate fails. Codeberg's terms restrict projects made mostly of generative-AI code, so never post or merge unattended. Run it only for a level the user asked for; an agent must not pick the level on its own.

Not for writing or improving a PR body (`forgejo-pr`), commit-only requests (`git-commit`), acting on review comments (`forgejo-pr-comments`), or GitHub repos (`ship`).

Arguments: $ARGUMENTS

The first word is the level when it is `push`, `pr`, or `merge`. The rest is context from the invoking session about what the work is and why. Use it for the commit body and the PR summary.

## Level

Use the level argument if given. Otherwise infer it from the context and take the lowest level that covers the request.

| Level | Request sounds like | Steps |
| --- | --- | --- |
| `push` | "commit and push" | commit, push |
| `pr` | "commit, push, and open a PR" | commit, push, open PR, watch checks |
| `merge` | "...then merge it" | all of the above, then merge |

## Never

- Force-push, rebase, amend, reset, or stash.
- Pass `--no-verify`, `--agit`, or any flag that skips hooks or branch protection.
- Open a PR from the default branch. At `pr` or `merge` level, branch off first (step 2).
- Pass `--method` to `fj pr merge` unless the context names a method. The repo's default merge style applies.
- Print or read fj's `keys.json` or any token.

## Steps

1. **Forge gate.** Run `git remote -v`, pick the remote for this branch (the branch upstream, else the only remote; never assume `origin`), and read its host with `git remote get-url <remote>`. github.com, or a host `gh auth status --hostname <host>` knows, is GitHub: stop and say "use /ship" (if installed). Forgejo means codeberg.org, a host where `curl -fsS https://<host>/api/forgejo/v1/version` answers, or a repo with `.forgejo/workflows` or `.gitea/workflows`. If neither is clear, stop and report. With several remotes, put `-R <remote>` on every `fj pr` call (`fj pr -R <remote> create ...`). Check `fj whoami` works for the host; if fj is missing or logged out, stop and point to `forgejo-cli` if installed.
2. **Branch.** At `push` level, stay on the current branch, including the default branch; the request authorizes it. At `pr` or `merge` level on the default branch, create a branch named by the repo's convention (`git-commit` holds the branch-naming rules) and carry the working changes onto it. Find the default branch with `git symbolic-ref --short refs/remotes/<remote>/HEAD`; if unset, `git remote show <remote>`.
3. **Commit.** Run `git status --short --branch`, `git diff`, `git diff --staged`, and `git log --oneline -15`. Use the repo's message convention (`git-commit` holds the rules; otherwise match recent history and use Conventional Commits). Stage explicit paths, leave unrelated or sensitive files out, and report them. Commit and let hooks run. If a hook fails, fix what it reports and make a new commit. With nothing to commit and unpushed commits ahead, go on to push.
4. **Push.** Run `git push -u <remote> <branch>` (plain `git push` when the upstream already exists). fj needs the upstream to find the PR head. On a non-fast-forward rejection, stop and report. Don't rebase to make it fit. If branch protection rejects a push to the default branch, stop and offer the `pr` level.
5. **Open the PR** (`pr`, `merge`). `fj pr create` does not push, which is why step 4 comes first. fj has no head-branch filter, so look for an existing PR with `fj pr search <branch>` and confirm the head with `fj pr view <n>`; reuse a match. Otherwise write the body to a temp file and run `fj pr create --base <default> --body-file <file> "<title>"`. It is a ready PR: no `WIP:` prefix. Title in the repo's convention. Body is a short summary from the context and any test evidence it names. Then run `fj pr status <n> --wait`.
6. **Read the checks.** The exit code of `fj pr status --wait` is not verified. Read every context line: any failure, error, or non-success line counts as failed, whatever the exit code. Pending after the wait, or an unreadable output, is a stop too. No contexts at all counts as passing.
7. **Merge** (`merge`), only when every check passed. Run `fj pr merge <n> --delete`. A branch-protection refusal is a stop, not a reason to retry with flags. Then `git switch <default>` and `git pull --ff-only`. In a linked worktree where the default branch is checked out elsewhere, skip the switch and report it. Don't remove the worktree.
8. **On failed checks,** stop shipping and do not merge. Report each failing context by name and state. fj has no run logs; the invoking session fixes it with the failed-run procedure in `forgejo-actions` if installed, and runs ship again.

## Report

Commit SHA(s), branch, PR URL, check result, merge result, and any files left uncommitted. Name the step that stopped the run and why.
