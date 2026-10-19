# CLI commands and flags

Contents: lineage and status, installation, git-flow-next, gitflow-avh, syntax differences.

## Lineage and status

| CLI | Status |
|---|---|
| nvie/gitflow | Archived 2025-10-14, last release 0.4.1. README names git-flow-next as successor |
| gitflow-avh | Archived 2023-06-19, last release 1.12.3 (2019-05-23). README names no successor |
| git-flow-next (git-flow.sh) | Active, Go rewrite by the Tower team, v2.1.0 (2026-09-08) |

Install: `brew install git-flow-next` (conflicts with the `git-flow` formula), `winget install GitTower.GitFlowNext` and `scoop install git-flow-next` (per the README), AUR `gitflow-next-bin` (one version behind), release tarball with `git-flow` on PATH. `apt install git-flow` gives AVH 1.12.3. `brew install git-flow` gives nvie 0.4.1, which Homebrew deprecated.

## git-flow-next 2.1.0

```bash
git flow init [--defaults|-d] [--preset=classic|github|gitlab] [-f|--force] [--shared|--local|--global|--system|--file=path]
              [--main N] [--develop N] [--production N] [--feature P] [--bugfix P] [--release P] [--hotfix P] [--support P] [--tag P]
git flow <type> start [name] [base] [--no-fetch] [-w|--worktree]
git flow <type> finish [name] [options]       # also: git flow finish (current branch)
git flow <type> publish [name]                # also: git flow publish
git flow <type> update [name] [--rebase]      # pull parent into topic; also git flow update / rebase
git flow <type> list | delete <name> [-f] [-r] | rename <old> <new> | checkout <name> | track <name>
git flow integrate [branch]                   # merge parent into topic (1.2.0+)
git flow overview [--format=text|json|yaml]
git flow config list|add|edit|rename|delete|sync|status
git flow version
```

`<type>` is feature, bugfix, release, hotfix, support or a custom type. `support` is an ordinary topic type with upstream strategy `none`.

Finish options:
- Control: `-c/--continue`, `-a/--abort`, `-f/--force`.
- Tag: `--tag/--notag`, `--sign`, `--signingkey ID`, `-m MSG`, `--messagefile F`, `--tagname N`.
- Retention: `--keep`, `--keepremote`, `--keeplocal`, `--force-delete`.
- Strategy: `--rebase`, `--squash/-S`, `--squash-message`, `-M`, `--update-message`, `-p`, `--no-ff`, `--ff`, `--ff-only`.
- Remote: `--fetch` (default on) / `--no-fetch`, `--push`, `--pushtag`.
- Hooks: `--no-verify`.

Config: `gitflow.initialized`, `gitflow.version`, `gitflow.origin`; per branch `gitflow.branch.<name>.{type,parent,startpoint,prefix,upstreamstrategy,downstreamstrategy,autoupdate,tag,tagprefix,worktree}`; per command `gitflow.<type>.<cmd>.<opt>`. Precedence: branch config, command config, CLI flags. Classic preset: `main` root, `develop` (parent main, autoUpdate), `feature/` and `bugfix/` (parent develop), `release/` (parent main, start point develop, tag), `hotfix/` (parent main, tag), `support/` (parent main, strategy none).

AVH key mapping on import: `gitflow.branch.master` to `gitflow.branch.main`; `gitflow.prefix.X` to `gitflow.branch.X.prefix`; `gitflow.prefix.versiontag` to `gitflow.branch.*.tagprefix`. Missing from next: `gitflow.allowdirty`, `-b/--nobackmerge`, `--ff-master`, `feature diff`, `feature pull`, `--showcommands`.

## gitflow-avh 1.12.x

Flags go before the positional name.

```bash
git flow init [-d] [-f]
git flow feature|bugfix start [-F] <name> [<base>]
git flow feature|bugfix finish [-F] [-r] [-p] [-k] [-D] [-S] [--no-ff] <name>
git flow feature publish|track|diff|checkout|rebase|pull|delete|rename
git flow release start [-F] <version> [<base>]
git flow release finish [-F] [-s] [-u key] [-m msg | -f file] [-p] [-k] [-n] [-b] [-S] [-e] [-T tag] <version>
git flow hotfix start [-F] <version> [<base>]
git flow hotfix finish [-F] [-s] [-u] [-m | -f] [-p] [-k] [-n] [-b] [-S] [-T] <version>
git flow support start [-F] <version> <base>
git flow config [list|set|base]
```

- `-F` fetch (default off). `-p` push after finish (default off); release also has `--pushproduction`, `--pushdevelop`, `--pushtag`.
- `-k/--keep`, `-D` force-delete the branch. `-S` squash. Feature: `-r` rebase before merging.
- `-s`, `-u` sign the tag; `-m` message, `-f` message file; `-n` no tag; `-T` tag name.
- `-b/--nobackmerge` merges the release branch, not the tag, into develop. `--nodevelopmerge` skips develop.
- Release and hotfix finish: `merge --no-ff` into main, `tag -a`, then merge the tag into develop.
- Config under `[gitflow]`: `gitflow.branch.{master,develop}`, `gitflow.prefix.{feature,bugfix,release,hotfix,support,versiontag}`. Per-command defaults: `git config gitflow.release.finish.push true`.
- `init -d` picks the production branch in the order `production`, `main`, `master`.

## Syntax differences

| Task | AVH | git-flow-next |
|---|---|---|
| Rebase feature on develop | `feature rebase` | `feature update --rebase` / `git flow rebase` |
| Merge develop into feature | manual | `git flow update` / `integrate` |
| Feature merge style | `--no-ff` (not for one commit) | fast-forward if possible |
| Release back-merge | tag into develop | main into develop |
| Push on finish | `-p` (off) | `--push` (off) |
| Fetch on finish | `-F` (off) | on |
| Resume after conflict | re-run finish | `--continue` / `--abort` |
| Tag message | `-m` / `-f FILE` | `-m` / `--messagefile` (`-f` = force) |
| Diff / pull | `feature diff`, `feature pull` | not implemented |
