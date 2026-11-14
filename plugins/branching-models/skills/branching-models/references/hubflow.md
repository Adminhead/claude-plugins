# HubFlow (`git hf`)

Read when the repo has a `[hubflow]` section in `.git/config` or the user asks for `git hf`. HubFlow is git-flow plus automatic pushing to origin and GitHub pull requests for features. Command: `git hf`. Config lives under `[hubflow]`, not `[gitflow]`.

Contents: status, safety, when it fits, detect, procedures, behaviours to warn about, caveats, command reference.

## Status: archived

- The datasift/gitflow repo is archived (last release v1.5.4, last commit 2022-05-01) and its docs site (datasift.github.io/gitflow) returns 404. Docs survive in the repo's `gh-pages` branch.
- There is no package-manager install. Only `git clone https://github.com/datasift/gitflow && cd gitflow && sudo ./install.sh`. Do not run it without asking.
- Use this only for a repo already set up with `git hf`. For a new repo suggest git-flow (git-flow-next) or trunk-based; do not adopt HubFlow.

## Safety: HubFlow pushes on its own

`feature start`, `feature finish`, `release start`/`finish` and `hotfix start`/`finish` push (and finish deletes remote branches). Tell the user exactly what a command will push or delete and get a go-ahead before running it. Never run a push, force-push, remote-branch delete or tag push unasked. Also ask first before `git hf push`, `feature push`, `release push`, `hotfix push`, `update -p` (assume it pushes unless checked), any `cancel` (may delete the remote branch; unverified), `git hf upgrade`, and `gh pr create`.

## When it fits

Same release shape as git-flow (versioned software, batched releases), for a team in one GitHub organisation sharing a repo, who want every branch on origin and every feature PR-reviewed. If the repo is continuously deployed, git-flow's author suggests something simpler such as GitHub flow, and trunk-based is the stricter alternative.

## Detect

Shared signals: [detection.md](detection.md). HubFlow-specific:

- `git config --get-regexp '^hubflow\.'` shows `hubflow.branch.master`, `hubflow.branch.develop`, `hubflow.prefix.*`, `hubflow.origin`. Present: proceed.
- The docs say to run `git hf init` after every clone (non-interactive by default; `-a` asks for names, `-f` forces). Offer it if the config is missing but the branch layout and `git hf version` say HubFlow.
- `[gitflow]` only: plain git-flow, use the git-flow procedures in SKILL.md.

## Procedures

Use `git hf` when installed (check `git hf version`); otherwise the plain-git column.

| Task | `git hf` | What it does beyond git-flow | Plain git (local part) |
|---|---|---|---|
| Start feature | `git hf feature start NAME` | Fetches; requires local `develop` == `origin/develop` and no such branch on origin; **pushes the new branch** | `git switch -c feature/NAME develop` |
| Share work | `git hf push` | fetch, merge `origin/<current>`, push | `git pull`, `git push -u origin HEAD` |
| Open PR | `gh pr create --base develop` | `git hf feature submit` is likely broken, see Caveats | same |
| Finish feature | `git hf feature finish NAME` | Run **after** the PR is merged on GitHub; deletes `origin/feature/NAME`, pushes develop | `git switch develop && git pull && git branch -d feature/NAME` |
| Start release | `git hf release start X.Y.Z` | Fetches and pushes by default | `git switch -c release/X.Y.Z develop` |
| Finish release | `git hf release finish X.Y.Z` | Merges to master, tags, merges the tag into develop, **pushes develop, master and tags, deletes the remote branch** | `--no-ff` merge to master, `git tag -a`, merge into develop |
| Start/finish hotfix | `git hf hotfix start X.Y.Z` / `git hf hotfix finish X.Y.Z` | Same push behaviour as release | as git-flow |
| Abandon | `git hf feature cancel [-f] NAME` (also `release`, `hotfix`) | May delete the remote branch (unverified) | `git branch -D` (ask first) |
| Refresh | `git hf update` | merges origin/master and origin/develop into local ones, prunes | `git fetch --prune` and merge |

Daily loop from the docs: `feature start`, `git hf push` while working, `git hf update && git merge develop` on the feature each morning, PR on GitHub merged by a colleague ("Don't accept your own pull requests!"), `feature finish`. Example release: `git hf update && git hf release start 2.6.0`, bump the version and fix bugs on the branch, then `git hf release finish 2.6.0` tags on master and pushes everything.

## Behaviours to warn about

- **`feature finish` expects the PR already merged.** If `git rev-list develop..feature/x` is non-empty it stops with "Please raise a pull-request via GitHub first, or use the -f flag." `-f` does a real local merge, then pushes the merged develop and deletes the remote branch, bypassing PR review. Ask first.
- **`-Xtheirs` on release and hotfix finish.** Finish merges into master with `git merge --no-ff -srecursive -Xtheirs`, silently resolving conflicts in favour of the release/hotfix branch. Before finishing, preview conflicts with `git merge-tree --write-tree master release/X.Y.Z` (git 2.38+; exit 1 means conflicts that finish would auto-resolve toward the release branch), and tell the user.
- Release and hotfix finish merge the tag into develop (`-b` merges the branch instead).
- A hotfix while a release branch is open: AVH and git-flow-next do not handle it (HubFlow's source wasn't checked, so assume it doesn't either). Merge the hotfix into the release branch by hand before finishing, as in the git-flow section of SKILL.md.
- `hotfix start <ver> <older-tag>` still finishes into the latest master, which per the docs can leave master with the wrong version number. Do not use it for old lines.
- The docs say not to fork repos on GitHub; clone the shared repo directly.

## Caveats (inferred from source, not tested)

- `git hf feature submit` likely fails to authenticate: its token bootstrap calls GitHub's OAuth Authorizations API, which GitHub removed in 2020. It probably works only after `git config github.oauth.token <PAT>`. Prefer `gh pr create --base develop`.
- If the PR was squash- or rebase-merged on GitHub, the feature commits are probably not ancestors of develop, so `feature finish` likely refuses and needs `-f`. Prefer merge-commit PR merges in these repos, or tell the user to expect the refusal.

## Command reference (v1.5.4)

```bash
git hf init [-af]
git hf feature [list] [-v]
git hf feature start <name> [<base>]          # -F/--nofetch to skip fetch; pushes branch to origin
git hf feature submit [<name>] [<base>]       # opens a GitHub PR via API (likely broken, see Caveats)
git hf feature finish [-rFkD] [<name|nameprefix>]   # -r rebase, -F no fetch, -k keep, -D force delete, -f force merge if PR not merged
git hf feature track <name>
git hf feature diff [<name|nameprefix>]
git hf feature rebase [-i] [<name|nameprefix>]
git hf feature checkout [<name|nameprefix>]   # alias: co
git hf feature pull [-r] [<remote> [<name>]]
git hf feature push [<remote> [<name>]]
git hf feature cancel [-f] <name>
git hf release [list] [-v]
git hf release start <version> [<base>]
git hf release finish [-sumpk] <version>      # -s sign, -u key, -m tag msg, -p push (default on), -k keep, -n notag, -b nobackmerge
git hf release cancel <version>
git hf release push [<name>] | pull [<name>]
git hf hotfix [list] [-v]
git hf hotfix start <version> [<base>]
git hf hotfix finish [-sumpk] <version>
git hf hotfix track <name> | pull [-r] [<remote> [<version>]] | push [<remote> [<version>]] | cancel [-f] <version>
git hf support [list] [-v]
git hf support start [-F] <version> <base>    # exists but minimal
git hf push [-F]          # fetch, merge origin/<current> into current, push current (creates upstream if new)
git hf pull [-r]          # fetch and merge (or rebase) origin/<current> into current
git hf update [-p]        # merge origin/master and origin/develop into local master/develop; prune deleted remote branches
git hf version
git hf upgrade            # self-upgrade from GitHub; do not run unasked
```

Defaults: `init` uses `master`, `develop`, `feature/`, `release/`, `hotfix/`, `support/`, empty tag prefix. Release and hotfix `start`/`finish` have fetch (default true) and push (default true). Finish: merge into master with `git merge --no-ff -srecursive -Xtheirs`, `git tag -a`, merge the tag into develop, push develop, master and `--tags`, delete the remote branch.
