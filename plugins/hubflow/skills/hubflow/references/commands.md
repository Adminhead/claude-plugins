# git hf commands (v1.5.4)

Ask the user before any of these push or delete remote state: `start`/`finish` (feature, release, hotfix), every `push`, `update -p` (assume it pushes unless checked), and every `cancel` (may delete the remote branch; unverified). `gh pr create` also needs a go-ahead.

```bash
git hf init [-af]
git hf feature [list] [-v]
git hf feature start <name> [<base>]          # -F/--nofetch to skip fetch; pushes branch to origin
git hf feature submit [<name>] [<base>]       # opens a GitHub PR via API (likely broken, see SKILL.md)
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
git hf support start [-F] <version> <base>
git hf push [-F]          # fetch, merge origin/<current> into current, push current (creates upstream if new)
git hf pull [-r]          # fetch and merge (or rebase) origin/<current> into current
git hf update [-p]        # merge origin/master and origin/develop into local master/develop; prune deleted remote branches
git hf version
git hf upgrade           # self-upgrade from GitHub; do not run unasked
```

Defaults: `init` uses `master`, `develop`, `feature/`, `release/`, `hotfix/`, `support/`, empty tag prefix. Config keys: `hubflow.branch.master`, `hubflow.branch.develop`, `hubflow.prefix.*`, `hubflow.origin`.

Release and hotfix `start`/`finish` have fetch (default true) and push (default true). Finish: merge into master with `git merge --no-ff -srecursive -Xtheirs`, `git tag -a`, merge the tag into develop, push develop, master and `--tags`, delete the remote branch. `-p` is listed as push, default on.

Documented example release: `git hf update && git hf release start 2.6.0` (bump version, fix bugs on the branch), then `git hf release finish 2.6.0` tags on master and pushes everything.

`support start` exists but is minimal.
