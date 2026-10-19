---
name: hubflow
description: Works in a repo that already uses HubFlow, the archived DataSift fork of git-flow (`git hf`, `[hubflow]` in .git/config, master + develop, feature branches pushed to origin and merged by GitHub PR). Use when asked for "hubflow", "git hf", "git hf feature start", "git hf release finish", "hf hotfix", or when `.git/config` has a `[hubflow]` section. Not for plain git-flow repos (git-flow), trunk-based repos (trunk-based), commit messages or branch names (git-commit), history spelunking (git-history) or GitHub releases (gh-release).
---

# HubFlow

HubFlow is git-flow plus automatic pushing to origin and GitHub pull requests for features. Command: `git hf`. Config lives under `[hubflow]`, not `[gitflow]`.

## Status: archived

- The datasift/gitflow repo is archived (last release v1.5.4, last commit 2022-05-01) and its docs site (datasift.github.io/gitflow) returns 404. Docs survive in the repo's `gh-pages` branch.
- There is no package-manager install. Only: `git clone https://github.com/datasift/gitflow && cd gitflow && sudo ./install.sh`. Do not run it without asking.
- Use this skill only for a repo already set up with `git hf`. For a new repo suggest git-flow (git-flow-next) or trunk-based instead.

## Safety rules

- Run `git status` first.
- **HubFlow pushes to origin on its own.** `feature start`, `feature finish`, `release start`/`finish` and `hotfix start`/`finish` push (and finish deletes remote branches). Tell the user exactly what a command will push or delete and get a go-ahead before running it. Never run a push, force-push, remote-branch delete or tag push unasked.
- Branch naming and commit messages: defer to the `git-commit` skill when it is installed.

## When to use this model

Same release shape as git-flow (versioned software, batched releases), for a team in one GitHub organisation sharing a repo, who want every branch on origin and every feature PR-reviewed. Do not adopt it for a new project: it is archived and has the risks below. If the repo is continuously deployed, git-flow's author suggests something simpler such as GitHub flow, and trunk-based is the stricter alternative.

## Detect first

```bash
git config --get-regexp '^hubflow\.'    # hubflow.branch.master / develop, hubflow.prefix.*, hubflow.origin
git config --get-regexp '^gitflow\.'
git branch -a | grep -E 'develop|feature/|release/|hotfix/'
```

- `[hubflow]` present: proceed. The docs say to run `git hf init` after every clone; it is non-interactive by default (`-a` asks for names, `-f` forces). Offer it if the config is missing but the branch layout and `git hf version` say HubFlow.
- `[gitflow]` only: plain git-flow. Say so and defer to the `git-flow` skill when installed.
- Neither, and no `develop`: probably trunk-based or GitHub flow. Defer to `trunk-based` when installed. Do not impose HubFlow.

More signals: [references/detection.md](references/detection.md).

## Day-to-day procedures

`git hf` when installed (check `git hf version`); otherwise the plain-git column. Full tables: [references/commands.md](references/commands.md).

| Task | `git hf` | What it does beyond git-flow | Plain git (local part) |
|---|---|---|---|
| Start feature | `git hf feature start NAME` | Fetches; requires local `develop` == `origin/develop` and no such branch on origin; **pushes the new branch** | `git switch -c feature/NAME develop` |
| Share work | `git hf push` | fetch, merge `origin/<current>`, push | `git pull`, `git push -u origin HEAD` |
| Open PR | `gh pr create --base develop` | `git hf feature submit` is likely broken, see Caveats | same |
| Finish feature | `git hf feature finish NAME` | Run **after** the PR is merged on GitHub; deletes `origin/feature/NAME`, pushes develop | `git switch develop && git pull && git branch -d feature/NAME` |
| Start release | `git hf release start X.Y.Z` | Fetches and pushes by default | `git switch -c release/X.Y.Z develop` |
| Finish release | `git hf release finish X.Y.Z` | Merges to master, tags, merges the tag into develop, **pushes develop, master and tags, deletes the remote branch** | `--no-ff` merge to master, `git tag -a`, merge into develop |
| Hotfix | `git hf hotfix start|finish X.Y.Z` | Same push behaviour as release | as git-flow |
| Abandon | `git hf feature|release|hotfix cancel [-f] NAME` | | `git branch -D` (ask first) |
| Refresh | `git hf update` | merges origin/master and origin/develop into local ones, prunes | `git fetch --prune` and merge |

Daily loop from the docs: `feature start`, `git hf push` while working, `git hf update && git merge develop` on the feature each morning, PR on GitHub merged by a colleague ("Don't accept your own pull requests!"), `feature finish`.

## Behaviours to warn about

- **`feature finish` expects the PR already merged.** If `git rev-list develop..feature/x` is non-empty it stops with "Please raise a pull-request via GitHub first, or use the -f flag." Only use `-f` after telling the user it does a real local merge.
- **`-Xtheirs` on release and hotfix finish.** Finish merges into master with `git merge --no-ff -srecursive -Xtheirs`, silently resolving conflicts in favour of the release/hotfix branch. Before finishing, preview conflicts with `git merge-tree --write-tree master release/X.Y.Z` (exit 1 means conflicts that finish would auto-resolve toward the release branch), and tell the user.
- Release and hotfix finish merge the tag into develop (`-b` merges the branch instead).
- No tool handles a hotfix while a release branch is open (Driessen's rule: merge the hotfix into the release branch instead of develop). Do it by hand before finishing: `git switch release/X.Y && git merge --no-ff hotfix/X.Y.Z`.
- `hotfix start <ver> <older-tag>` still finishes into the latest master, which per the docs can leave master with the wrong version number. Do not use it for old lines.
- Docs say not to fork repos on GitHub; clone the shared repo directly.

## Caveats (inferred from source, not tested)

- `git hf feature submit` likely fails to authenticate: its token bootstrap calls GitHub's OAuth Authorizations API, which GitHub removed in 2020. It probably works only after `git config github.oauth.token <PAT>`. Prefer `gh pr create --base develop`.
- If the PR was squash- or rebase-merged on GitHub, the feature commits are probably not ancestors of develop, so `feature finish` likely refuses and needs `-f`. Prefer merge-commit PR merges in these repos, or tell the user to expect the refusal.
