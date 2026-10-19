---
name: git-flow
description: Works in a repo that uses the git-flow branching model (main + develop, feature/release/hotfix/support branches), with the git-flow-next or AVH CLI or plain git. Use when asked for "git flow feature start", "start a release", "finish a release", "hotfix", "git flow init", "develop branch", "support branch", or "which branching model should we use". Not for commit messages or branch names (git-commit), history spelunking (git-history), GitHub releases (gh-release), HubFlow repos (hubflow) or trunk-based repos (trunk-based).
---

# git-flow

Procedures for the Driessen branching model: `main` (every commit is a release, tagged) and `develop` (integration for the next release), plus `feature`, `release`, `hotfix` and `support` branches.

## Safety rules

- Run `git status` first. Stop on a dirty tree unless the user says otherwise.
- Never push, force-push, delete remote branches, or tag-and-push without the user's go-ahead. The finish commands below are local; show the push command and ask.
- Branch naming and commit messages: defer to the `git-commit` skill when it is installed. The tools default to `feature/`, `release/`, `hotfix/`, `support/` prefixes.

## When to use this model

Use git-flow when the software is explicitly versioned, or several versions are supported in the wild (libraries, SDKs, desktop/mobile/embedded apps, on-prem products), and releases are batched or gated (QA sign-off, regulated release). Driessen's 2020 note says it "may still be as good of a fit" there.

Suggest a different model when:
- The team deploys continuously from one version in production. Driessen himself recommends "a much simpler workflow (like GitHub flow)". trunk-based is the stricter alternative, with feature flags and fast CI.
- The repo already uses HubFlow (`[hubflow]` in `.git/config`): use the `hubflow` skill instead.

Offer this only as a suggestion; do not restructure a repo's branching uninvited.

## Detect the repo's model first

```bash
git config --get-regexp '^gitflow\.'; git config --get-regexp '^hubflow\.'; test -f .gitflow && echo shared-config
git ls-remote --heads origin | awk '{print $2}' | sed 's#refs/heads/##'
```

- `[hubflow]` config: this is a HubFlow repo. Say so and defer to the `hubflow` skill if installed.
- `[gitflow]` config, a `.gitflow` file, or `develop` plus `release/*`, `hotfix/*` branches: git-flow, proceed.
- Only `main` plus short-lived branches, CI filtering on `main` only: likely trunk-based or GitHub flow. Say so and defer to `trunk-based` if installed; do not impose git-flow.
- `[gitflow]` config lives in `.git/config`, per clone, so a fresh clone has none. A lone `develop` branch is weak evidence. Check branches, merge history and CI filters (`grep -rnE 'develop|release/|hotfix/' .github/workflows .gitlab-ci.yml 2>/dev/null`), then offer `git flow init -d`.

More signals: [references/detection.md](references/detection.md).

## Pick the tool

Run `git flow version`:
- `X.Y.Z (git-flow-next)` (2.x) or `git-flow-next version X` (1.x): git-flow-next, the only maintained CLI. Recommend it.
- `X.Y.Z (AVH Edition)`: gitflow-avh, archived 2023-06-19. It is what `apt install git-flow` ships. Works, unmaintained.
- `0.4.1`: nvie's original, archived 2025-10-14. Do not recommend.
- Not installed: use the plain-git sequences, or suggest `brew install git-flow-next` / `winget install GitTower.GitFlowNext` / `scoop install git-flow-next`. There is no apt package of git-flow-next. Do not install anything without asking.

## Day-to-day procedures

Prefer the CLI when installed; otherwise the plain-git column in [references/plain-git.md](references/plain-git.md) is exact. Short forms:

| Task | git-flow-next / AVH | Plain git |
|---|---|---|
| Init | `git flow init -d` | create `develop` from `main`, push |
| Start feature | `git flow feature start NAME` | `git switch -c feature/NAME develop` |
| Finish feature | `git flow feature finish NAME` | `git switch develop && git merge --no-ff feature/NAME && git branch -d feature/NAME` |
| Start release | `git flow release start X.Y.Z` | `git switch -c release/X.Y.Z develop` |
| Finish release | `git flow release finish X.Y.Z` | merge `--no-ff` into `main`, tag, merge into `develop`, delete branch |
| Start hotfix | `git flow hotfix start X.Y.Z` | `git switch -c hotfix/X.Y.Z main` |
| Finish hotfix | `git flow hotfix finish X.Y.Z` | merge `--no-ff` into `main`, tag, merge into `develop` or the open release branch |

On a release branch: bump the version, fix bugs only, no new features.

## Rule no tool automates: hotfix while a release branch is open

If `release/*` exists when a hotfix finishes, the hotfix goes into the release branch instead of `develop` (the release carries it to develop when it finishes; merging into develop too is fine if develop needs it now). Neither AVH nor git-flow-next does this: with a release open they merge the hotfix into `main` and `develop` only. Before finishing the hotfix, do it by hand:

```bash
git switch release/X.Y && git merge --no-ff hotfix/X.Y.Z   # or cherry-pick
```

## git-flow-next differences (2.1.0)

Spell these out to the user when the repo uses git-flow-next:

- **Fast-forward by default.** Feature and release finish fast-forward when possible, so no merge commit and the tag sits on the bump commit. For Driessen history pass `--no-ff`, or set once: `git config gitflow.feature.finish.no-ff true` (same for `release` and `hotfix`).
- **Back-merge differs per tool.** git-flow-next merges `main` into `develop` ("Merge branch 'main' into develop"); AVH merges the tag into `develop` (`-b` merges the branch instead); Driessen merges the release branch. Expect a different develop history per tool.
- **No push without `--push`.** Finish is local only; `--push` pushes the target, develop and the tag. Ask before using it.
- **Finish fetches by default** and aborts if the branch or parent is behind or diverged; use `--no-fetch` offline. After a conflict: `finish --continue` or `--abort`.
- **`-f` means different things.** In git-flow-next `-f` is `--force`; in AVH `release finish -f FILE` is the tag message file. Use `-m "msg"` for the message in both, and `--messagefile` in git-flow-next.
- AVH parses options with getopt: flags go before the name (`release finish -m "msg" 1.0`). git-flow-next accepts either order.
- AVH fast-forwards a feature with exactly one commit even though it uses `--no-ff`.
- AVH allows one open release and one open hotfix at a time.

Full flag lists and config keys: [references/cli-commands.md](references/cli-commands.md). Read it when a flag, config key or AVH-to-next migration question comes up.

## Gotchas

- `git flow init` on a repo with AVH config imports it automatically in git-flow-next. `git flow init --defaults --shared` also writes a committable `.gitflow` file (2.0.0+).
- Tags are annotated only when a message is given (`-m`).
- Driessen never pushes `main` or tags; after a finish the user decides: `git push origin main develop --follow-tags`.
