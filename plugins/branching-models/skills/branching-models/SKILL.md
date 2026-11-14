---
name: branching-models
description: Follows whichever branching model a repo already uses, and answers "which branching model does this repo use" or "should we use trunk-based or git-flow". Covers git-flow (main + develop, feature/release/hotfix branches, git-flow-next or AVH or plain git), HubFlow (`git hf`, `[hubflow]` config) and trunk-based (short-lived branches, flags, release branches with cherry-picks). Use for "git flow feature start", "finish a release", "hotfix", "git flow init", "develop branch", "git hf", "trunk-based", "release branch cherry-pick". Not for commit messages or branch names (git-commit), history (git-history), GitHub releases (gh-release) or opening a PR (ship).
---

# Branching models: git-flow, HubFlow, trunk-based

Procedures for three models: git-flow (Driessen: `main` is every release, tagged; `develop` integrates the next release; `feature`, `release`, `hotfix`, `support` branches), HubFlow (git-flow plus auto-push and PR-reviewed features) and trunk-based (one trunk, flags, optional release branches).

## Detect the repo's model first

```bash
git config --get-regexp '^gitflow\.'; git config --get-regexp '^hubflow\.'; test -f .gitflow && echo shared-config
git ls-remote --heads origin | awk '{print $2}' | sed 's#refs/heads/##'
```

- `[hubflow]` config: HubFlow. Follow [references/hubflow.md](references/hubflow.md).
- `[gitflow]` config, a `.gitflow` file, or `develop` plus `release/*`, `hotfix/*` branches: git-flow. Follow the git-flow sections below.
- Only `main` plus short-lived branches, CI filtering on `main` only, flag libraries in dependencies: trunk-based or GitHub flow. Follow the trunk-based section below.
- `[gitflow]` config lives in `.git/config`, per clone, so a fresh clone has none. A lone `develop` branch is weak evidence. Check branches, merge history and CI filters (`grep -rnE 'develop|release/|hotfix/' .github/workflows .gitlab-ci.yml 2>/dev/null`). If still unclear, ask the user which model the team follows.

Work in the model the repo follows. Never migrate a repo's model unasked: no `git flow init`, no new `develop` branch, no changed config, no branch restructuring. When the request uses another model's vocabulary (for example "start a release" or `git flow feature start` in a trunk-based repo), do the repo's own equivalent or ask. Offer `git flow init -d` only for a repo that is already git-flow but has no local config.

Read [references/detection.md](references/detection.md) when the check above is inconclusive.

## Safety rules (all models)

- Run `git status` first. Stop on a dirty tree unless the user says otherwise.
- Never push, force-push, delete remote branches, or tag-and-push without the user's go-ahead. Finishing a release or hotfix, tagging, deleting a branch and any force operation also need the user's confirmation. Show the command and ask. Pushing to trunk is itself a push: ask even for a one-line fix.
- git-flow: finish is local only with default config, but before any finish run `git config --get-regexp '^gitflow\..*push'`; a set push option (for example `gitflow.release.finish.push true`) makes finish a push, so get the user's go-ahead first.
- HubFlow pushes on its own: `git hf` feature, release and hotfix `start` and `finish` push and finish deletes remote branches. State what a command will push or delete and get a go-ahead; the full ask-first list is in [references/hubflow.md](references/hubflow.md).
- Branch naming and commit messages: defer to the `git-commit` skill when it is installed. The tools default to `feature/`, `release/`, `hotfix/`, `support/` prefixes.

## Choosing a model (only when asked)

Offer this as a suggestion; do not restructure a repo's branching uninvited.

- git-flow fits explicitly versioned software, or several versions supported in the wild (libraries, SDKs, desktop/mobile/embedded apps, on-prem products), with batched or gated releases (QA sign-off, regulated release). Driessen's 2020 note says it "may still be as good of a fit" there.
- A team deploying continuously from one version should use something simpler: Driessen recommends "a much simpler workflow (like GitHub flow)"; trunk-based is the stricter alternative, with feature flags and fast CI. Trunk-based fits poorly with iterations of four weeks or more, large unsplittable stories, slow or flaky CI, or no test and flag discipline.
- The sources disagree on versioned software: trunkbaseddevelopment.com says Git Flow is incompatible with trunk-based development, which would release such software from trunk tags and release branches; git-flow's author says git-flow still fits it.
- HubFlow is archived: never recommend it for a new project (see the reference).

## git-flow: pick the tool

Run `git flow version`:
- `X.Y.Z (git-flow-next)` (2.x) or `git-flow-next version X` (1.x): git-flow-next, the only maintained CLI. Recommend it.
- `X.Y.Z (AVH Edition)`: gitflow-avh, archived 2023-06-19. It is what `apt install git-flow` ships. Works, unmaintained.
- `0.4.1`: nvie's original, archived 2025-10-14. Do not recommend.
- Not installed: use the plain-git sequences, or suggest `brew install git-flow-next` / `winget install GitTower.GitFlowNext` (per the README, unverified) / `scoop install git-flow-next`. There is no apt package of git-flow-next. Do not install anything without asking.

## git-flow: day-to-day procedures

Prefer the CLI when installed; otherwise the plain-git column in [references/plain-git.md](references/plain-git.md) is exact. Short forms:

| Task | git-flow-next / AVH | Plain git |
|---|---|---|
| Init | `git flow init -d` | create `develop` from `main`, push (ask first) |
| Start feature | `git flow feature start NAME` | `git switch -c feature/NAME develop` |
| Finish feature | `git flow feature finish NAME` | `git switch develop && git merge --no-ff feature/NAME && git branch -d feature/NAME` |
| Start release | `git flow release start X.Y.Z` | `git switch -c release/X.Y.Z develop` |
| Finish release | `git flow release finish X.Y.Z` | merge `--no-ff` into `main`, tag, merge into `develop`, delete branch |
| Start hotfix | `git flow hotfix start X.Y.Z` | `git switch -c hotfix/X.Y.Z main` |
| Finish hotfix | `git flow hotfix finish X.Y.Z` | merge `--no-ff` into `main`, tag, merge into `develop` or the open release branch |

On a release branch: bump the version, fix bugs only, no new features.

### Rule no tool automates: hotfix while a release branch is open

If `release/*` exists when a hotfix finishes, the hotfix goes into the release branch instead of `develop` (the release carries it to develop when it finishes; merging into develop too is fine if develop needs it now). Neither AVH nor git-flow-next does this: with a release open they merge the hotfix into `main` and `develop` only. Before finishing the hotfix, do it by hand:

```bash
git switch release/X.Y && git merge --no-ff hotfix/X.Y.Z   # or cherry-pick
```

### git-flow-next differences (2.1.0)

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

### git-flow gotchas

- `git flow init` on a repo with AVH config imports it automatically in git-flow-next. `git flow init --defaults --shared` also writes a committable `.gitflow` file (2.0.0+).
- Pass `-m "msg"` on release and hotfix finish so git-flow-next makes an annotated tag (observed). The no-`-m` case is untested. `git push --follow-tags` pushes only annotated tags.
- Driessen never pushes `main` or tags; after a finish the user decides: `git push origin main develop --follow-tags`.

## HubFlow

The archived DataSift fork (`git hf`, `[hubflow]` config, `master` + `develop`, features pushed to origin and merged by GitHub PR). Use it only in a repo already set up for it. It pushes and deletes remote branches on its own, `feature finish` expects the PR already merged, and release and hotfix finish silently resolve conflicts toward the release branch (`-Xtheirs`). Read [references/hubflow.md](references/hubflow.md) before running any `git hf` command: it has the command table, the ask-first list and the warnings.

## Trunk-based

One trunk (`main`) that everyone integrates into at least daily; unfinished work is hidden, not parked on a long-lived branch. Use the style the repo already has: straight to trunk, or short-lived branches.

- Before a push to trunk: `git pull --rebase origin main`, then run the build and tests CI runs. A short-lived branch starts with `git switch -c NAME --no-track origin/main`; one developer, hours to about two days, merged once to close it, then deleted. Never create or publish release artifacts from it.
- Revert a broken trunk commit at once (`git revert <sha>`); do not leave trunk red.
- Incomplete code that is not behind a flag should not be merged. A large change gets a flag (see `feature-flags`; remove it about a month after release) or branch by abstraction on trunk, where no pushed commit may jeopardise going live, never a long-lived branch.
- Release from trunk: a release may be just an annotated tag on a trunk commit. Fix bugs on trunk and roll forward. Version by commit count or date unless the repo uses semver.
- Branch for release (`release/*` branches never merged back to trunk, `cherry picked from commit` lines on them): cut `release/X.Y` late from the release tag or a chosen commit (not necessarily HEAD). Fix on trunk first, with a test, then cherry-pick:

```bash
git branch release/1.4 v1.4.0
git switch release/1.4 && git cherry-pick -x <fix-sha>   # -x records the source sha
git tag -a v1.4.1 -m "v1.4.1"                            # pushing the branch and tag: ask first
```

  Fix on the release branch only when the bug cannot be reproduced on trunk, then cherry-pick it back to trunk. Run the trunk CI on active release branches. When the version is out of production, tag the released commit, then delete the branch (ask before deleting the remote one).
- Refuse or flag: merging a release branch back into trunk, merging trunk into a release branch, merging between release branches, one release branch across several major versions, code freezes, fixing on the release branch then merging down.
- With several agents writing at once, give each writer its own worktree and short-lived branch, sync with trunk at every checkpoint, and land branches one at a time. At very high commit rates pushes race; use the repo's merge queue if it has one, do not invent one.
