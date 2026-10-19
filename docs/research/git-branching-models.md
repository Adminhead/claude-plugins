# Git branching models: git-flow, HubFlow, trunk-based development

Research notes for three skills (git-flow, HubFlow, trunk-based development). All sources were accessed 2026-10-18. A claim marked **(observed)** was checked by running the tool in a scratch repository: git-flow-next 2.1.0 (official linux-amd64 release binary, checksum verified) and gitflow-avh 1.12.4-dev0 (the `develop` branch of the archived repo). A claim marked **(source)** was read from the tool's own source code. Everything else comes from the cited documentation.

---

## 1. git-flow

### 1.1 The model (Driessen, 2010)

Two long-lived branches:

- `master` (in newer tooling `main`): every commit is a production release and gets a tag.
- `develop`: the integration branch for the next release.

Supporting branches, with Driessen's original naming and merge rules [nvie]:

| Branch | Branches off | Merges back into | Naming |
|---|---|---|---|
| feature | `develop` | `develop` | anything except `master`, `develop`, `release-*`, `hotfix-*`. Usually only in the developer's repo, not on `origin` |
| release | `develop` | `develop` **and** `master` | `release-*` |
| hotfix | `master` | `develop` **and** `master` | `hotfix-*` |

The article uses `release-1.2` and `hotfix-1.2.1`. Every CLI uses slash prefixes by default (`feature/`, `release/`, `hotfix/`, `support/`, and `bugfix/` in AVH and git-flow-next).

There are no `support/*` branches in the article. They come from the tooling (nvie's CLI marks them experimental), and they are long-lived branches started from an old tag to maintain an old major version.

**Hotfix rule that no tool implements.** Driessen says that if a release branch exists when a hotfix finishes, the hotfix is merged into the **release branch instead of `develop`**, and the release carries it into develop when it finishes (merging into develop as well is fine if develop needs the fix now) [nvie]. Neither gitflow-avh (source: `git-flow-hotfix` has no release-branch handling) nor git-flow-next (observed: with `release/1.1` open, `hotfix finish 1.0.1` merged into `main` and `develop` and left `release/1.1` alone) does this. A skill has to do it by hand: `git checkout release/x && git merge --no-ff hotfix/y` before finishing, or cherry-pick.

**Why `--no-ff`:** it always records a merge commit, so the feature's commits stay grouped and a whole feature can be reverted with one revert. The cost is some empty merge commits, which Driessen considers worth it [nvie].

### 1.2 The 2020 "note of reflection" (verbatim excerpts)

At the top of the article, dated March 5, 2020 [nvie]:

> "Web apps are typically continuously delivered, not rolled back, and you don't have to support multiple versions of the software running in the wild. This is not the class of software that I had in mind when I wrote the blog post 10 years ago. If your team is doing continuous delivery of software, I would suggest to adopt a much simpler workflow (like GitHub flow) instead of trying to shoehorn git-flow into your team."

> "If, however, you are building software that is explicitly versioned, or if you need to support multiple versions of your software in the wild, then git-flow may still be as good of a fit to your team as it has been to people in the last 10 years."

> "To conclude, always remember that panaceas don't exist. Consider your own context. Don't be hating. Decide for yourself."

He also says people have treated git-flow "like a standard of sorts — but unfortunately also as a dogma or panacea."

### 1.3 Plain-git equivalents (Driessen's exact sequences)

```bash
# Feature
git checkout -b myfeature develop
# ...commits...
git checkout develop
git merge --no-ff myfeature
git branch -d myfeature
git push origin develop

# Release
git checkout -b release-1.2 develop
./bump-version.sh 1.2
git commit -a -m "Bumped version number to 1.2"
# ...release fixes only, no new features...
git checkout master
git merge --no-ff release-1.2
git tag -a 1.2            # article suggests -s or -u <key> to sign
git checkout develop
git merge --no-ff release-1.2   # may conflict on the version bump; resolve and commit
git branch -d release-1.2

# Hotfix
git checkout -b hotfix-1.2.1 master
./bump-version.sh 1.2.1
git commit -a -m "Bumped version number to 1.2.1"
git commit -m "Fixed severe production problem"
git checkout master
git merge --no-ff hotfix-1.2.1
git tag -a 1.2.1
git checkout develop      # or the open release branch, see 1.1
git merge --no-ff hotfix-1.2.1
git branch -d hotfix-1.2.1
```

The article never pushes `master` or the tag. In practice you also run `git push origin master develop --follow-tags` (or `git push origin 1.2`).

### 1.4 CLI lineage and status (as of 2026-10-18)

| CLI | Repo | Status | Last release |
|---|---|---|---|
| nvie/gitflow (original) | github.com/nvie/gitflow | **Archived 2025-10-14.** README: "This repository is no longer maintained" and names git-flow-next (git-flow.sh) as its successor | 0.4.1 (tag dated 2011-02-14) |
| gitflow-avh | github.com/petervanderdoes/gitflow-avh | **Archived 2023-06-19.** The README still says "under constant development" and names no successor | 1.12.3, 2019-05-23 |
| **git-flow-next** | github.com/gittower/git-flow-next | **Active.** Go rewrite by the Tower team, BSD-2. Site git-flow.sh says it is "Built on the original git-flow and gitflow-avh projects", which are "now discontinued" | **v2.1.0, 2026-09-08** |

git-flow-next releases (from git-flow.sh/changelog): 0.1.0 2025-09-16, 0.2.0 2026-01-11, 0.3.0 2026-01-14, 1.0.0 2026-02-08, 1.1.0 2026-04-06, 1.2.0 2026-08-01, 2.0.0 2026-08-09, 2.1.0 2026-09-08.

**Recommendation for 2026: git-flow-next.** It is the only maintained CLI, and the original author's repo points to it. AVH is still what many machines have, because distro packages ship it.

### 1.5 Installation

```bash
# git-flow-next (recommended)
brew install git-flow-next              # macOS/Linux Homebrew, 2.1.0; conflicts with the `git-flow` formula
winget install GitTower.GitFlowNext     # Windows (per README)
scoop install git-flow-next             # Windows (per README; Repology shows 2.1.0)
# Arch: AUR package gitflow-next-bin (2.0.0 at time of writing, one version behind)
# FreeBSD: devel/git-flow-next (1.1.0)
# Anything else: download the release tarball, put `git-flow` on PATH, chmod +x
git flow version                        # prints "2.1.0 (git-flow-next)" (format changed in 2.0.0)

# gitflow-avh (legacy, unmaintained)
sudo apt install git-flow               # Debian bullseye..sid and Ubuntu focal..current: the package is AVH 1.12.3
# Arch: AUR gitflow-avh 1.12.3

# nvie original (do not use)
brew install git-flow                   # nvie 0.4.1; Homebrew deprecated it 2025-12-19 (reason: repo_archived), disable date 2026-12-19
```

There is **no apt/deb package of git-flow-next**. On Debian/Ubuntu, `apt install git-flow` gives you AVH. The Homebrew API returns 404 for a `git-flow-avh` formula, so it appears to have been removed. I did not confirm when.

Telling them apart: `git flow version` prints `X.Y.Z (git-flow-next)` (2.x), `git-flow-next version X` (1.x), `1.12.3 (AVH Edition)`, or `0.4.1` for nvie.

### 1.6 Commands: gitflow-avh (1.12.x)

These are the usage lines from the source. **AVH parses options with shFlags/getopt, so put flags before the positional name** (`release finish -m "msg" 1.0`).

```bash
git flow init [-h] [-d] [-f]          # -d/--defaults: accept default names; -f/--force: reconfigure
                                      # also -p/-b/-r/-x/-s/-t for prefixes, --local/--global/--system/--file=
git flow feature [list] [-v]
git flow feature start [-F] <name> [<base>]
git flow feature finish [-F] [-r] [-p] [-k] [-D] [-S] [--no-ff] <name|nameprefix>
git flow feature publish [<name>]     # push -u origin feature/<name>
git flow feature track <name>
git flow feature diff | checkout | rebase [-i] [-p] | pull <remote> [<name>] | delete [-f] [-r] <name> | rename
git flow bugfix ...                   # same as feature, prefix bugfix/
git flow release start [-F] <version> [<base>]
git flow release finish [-F] [-s] [-u key] [-m msg | -f file] [-p] [-k] [-n] [-b] [-S] [-e] [-T tag] <version>
git flow release publish <name> | track <name> | delete [-f] [-r] <name> | rebase
git flow release branch ...           # release from an existing branch
git flow hotfix start [-F] <version> [<base>]
git flow hotfix finish [-F] [-s] [-u] [-m | -f] [-p] [-k] [-n] [-b] [-S] [-T] <version>
git flow hotfix publish | track | delete | rename | rebase
git flow support start [-F] <version> <base>
git flow config [list|set|base]
```

What the AVH finish flags mean (from the OPTIONS_SPEC):

- `-F/--[no]fetch`: fetch origin first (default off).
- `-p/--[no]push`: push to origin after finish (default **off**). Release also has `--pushproduction`, `--pushdevelop` and `--pushtag`.
- `-k/--keep`, `--keepremote`, `--keeplocal`: keep the branch. `-D/--force_delete` force-deletes it.
- `-S/--squash`: squash merge. Feature finish also has `-r/--rebase` (rebase before merging) and `-p/--preserve-merges`.
- `-s/--sign`, `-u/--signingkey`: sign the tag. `-m/--message` and `-f/--messagefile` set the tag message. With neither, `git tag -a` presumably opens an editor; I did not test this. `-n/--notag` skips the tag. `-T/--tagname` overrides the tag name.
- `-b/--nobackmerge`: merge the release branch, not master/the tag, into develop. Release also has `--nodevelopmerge` (skip the develop merge entirely), `--ff-master`, and `-e/--edit` (accept the generated merge message).

AVH merge behaviour (source and observed):

- Feature finish uses `--no-ff`, but **a feature with exactly one commit is fast-forwarded** (`git rev-list -n2 develop..branch` counts 1). nvie's CLI did the same.
- Release finish runs `git merge --no-ff release/x` into master, then `git tag -a`, then **merges the tag (not the release branch) into develop** (observed: `Merge tag '1.0' into develop`). `-b` restores Driessen's branch merge.
- Hotfix finish does the same: master, tag, then the tag into develop.
- Only one release branch and one hotfix branch may be open at a time ("There is an existing release branch ... Finish that one first").
- Config lives in `.git/config` under `[gitflow]`: `gitflow.branch.master`, `gitflow.branch.develop`, `gitflow.prefix.{feature,bugfix,release,hotfix,support,versiontag}`, `gitflow.path.hooks`. Per-command defaults go in `gitflow.<type>.<cmd>.<flag>`, for example `git config gitflow.release.finish.push true`.
- `init -d` on a repo whose default branch is `main` correctly picked `main` as production (observed). The guess order is `production`, `main`, `master`.

### 1.7 Commands: git-flow-next (2.1.0)

```bash
git flow init [--defaults|-d] [--preset=classic|github|gitlab|-p] [--custom] [-f|--force] [--init]
              [--shared|--local|--global|--system|--file=path] [--no-create-branches]
              [--main NAME] [--develop NAME] [--production NAME] [--staging NAME]
              [--feature P] [--bugfix|-b P] [--release|-r P] [--hotfix|-x P] [--support|-s P] [--tag|-t P]
git flow init --defaults --shared       # also writes a committable .gitflow file (2.0.0+)
git flow init                           # in a repo with AVH config, imports it automatically

git flow <type> start [name] [base] [--no-fetch] [-w|--worktree] [--worktree-path p]
git flow <type> finish [name] [options]           # shorthand: git flow finish (current branch)
git flow <type> publish [name] [-o push-option]   # shorthand: git flow publish
git flow <type> update [name] [--rebase] [--continue|--abort]   # pull parent into topic; shorthand git flow update / git flow rebase
git flow <type> list [--worktrees]
git flow <type> delete <name> [-f] [-r|--remote]
git flow <type> rename <old> <new>
git flow <type> checkout <name|prefix>
git flow <type> track <name>
git flow integrate [branch] ...         # merge parent into topic (1.2.0+)
git flow overview [--format=text|json|yaml] [-v]
git flow config list|add|edit|rename|delete base|topic ...|sync|status
git flow worktree add|remove|list|prune|path
git flow version | completion <shell> | shell-init <shell>
```

`<type>` is `feature`, `bugfix`, `release`, `hotfix`, `support`, or a custom type. The CLI also accepts the prefix aliases `feat/`, `rel/`, `hf/`, `sup/` and the plurals. `support` is an ordinary topic type with upstream strategy `none`, not a separate command.

Finish options (from the `git-flow-finish(1)` man page):

- Control: `-c/--continue`, `-a/--abort` (resume or undo after a conflict), `-f/--force`.
- Tag: `--tag/--notag`, `--sign/--no-sign`, `--signingkey <id>`, `-m/--message <msg>`, `--messagefile <file>`, `--tagname <name>`.
- Retention: `--keep`, `--keepremote`, `--keeplocal`, `--force-delete` (each has a `--no-` form).
- Strategy: `--rebase`, `--squash/-S`, `--squash-message`, `-M/--merge-message`, `--update-message`, `-p/--preserve-merges`, `--no-ff`, `--ff`, `--ff-only` (2.1.0).
- Remote: `--fetch` (**default on**) / `--no-fetch`, `--push/--no-push`, `--pushtag/--no-pushtag`.
- Hooks: `--no-verify`.

Defaults that differ from Driessen and from AVH. These matter for a skill:

1. **Merges fast-forward by default.** In the resolver, "Layer 1 is always FFModeFF (fast-forward when possible)". Observed: a two-commit feature fast-forwarded onto develop with no merge commit, and `release finish` fast-forwarded `main` to the release commit, so the tag sits on the bump commit with no `Merge branch 'release/1.0'`. To get Driessen's `--no-ff` history, pass `--no-ff` (observed: produces `Merge branch 'feature/b' into develop`) or set it once per type:
   ```bash
   git config gitflow.feature.finish.no-ff true
   git config gitflow.release.finish.no-ff true
   git config gitflow.hotfix.finish.no-ff true
   ```
2. **Back-merge is `main` into `develop`**, done by develop's `autoUpdate=true` with downstream strategy `merge`. Observed message: `Merge branch 'main' into develop`. Driessen merges the release branch and AVH merges the tag, so three tools give three different develop histories.
3. **Finish does not push by default.** Observed: after `release finish` with a remote configured, `origin/main` and `origin/develop` were unchanged and no tag was pushed. The man page says: "By default, finishing a branch performs only local work; nothing is pushed." `--push` pushes the target, every auto-updated child (develop) and the tag. Note: the 1.2.0 changelog entry reads "`finish` now pushes branches and tags", which describes the new `--push` capability, not a default. The man page and the observed behaviour agree that nothing is pushed by default.
4. **Finish fetches by default** and aborts if the topic or parent branch is behind or diverged from its remote (1.0.0+, made stricter in 1.2.0). Use `--no-fetch` offline.
5. **Release and hotfix finish land you on `develop`**, the same as AVH.
6. A tag is created for release and hotfix (`gitflow.branch.release.tag true`). With `-m` it is annotated (observed: `git cat-file -t 1.0` → `tag`).
7. Flags may come before or after the name (observed: `release finish 1.0 -m "..."` worked).

Config model (from CONFIGURATION.md; the `--defaults` output was observed): `gitflow.initialized`, `gitflow.version`, `gitflow.origin`. Per branch: `gitflow.branch.<name>.{type=base|topic, parent, startpoint, prefix, upstreamstrategy=merge|rebase|squash|none, downstreamstrategy, autoupdate, tag, tagprefix, worktree}`. Per command: `gitflow.<type>.<cmd>.<opt>`. Precedence: branch config, then command config, then CLI flags. The classic preset gives `main` (root), `develop` (parent main, autoUpdate), `feature/` and `bugfix/` (parent develop), `release/` (parent main, start point develop, tag), `hotfix/` (parent main, tag), `support/` (parent main, strategy none).

AVH key mapping on import: `gitflow.branch.master`→`gitflow.branch.main`, `gitflow.prefix.X`→`gitflow.branch.X.prefix`, `gitflow.prefix.versiontag`→`gitflow.branch.*.tagprefix`. AVH features missing from next, per its own compatibility doc (dated 2026-02-01, partly stale): `gitflow.allowdirty`, `-b/--nobackmerge`, `--ff-master`, `feature diff`, `feature pull`, `--showcommands`.

### 1.8 Syntax differences, AVH vs git-flow-next (quick table)

| Task | AVH | git-flow-next |
|---|---|---|
| Init non-interactively | `git flow init -d` | `git flow init -d` (or `--preset=classic --defaults`) |
| Finish the current branch | `git flow feature finish` (name optional) | also `git flow finish` |
| Rebase feature on develop | `git flow feature rebase` | `git flow feature update --rebase` / `git flow rebase` |
| Merge develop into feature | manual | `git flow update` / `git flow integrate` |
| Feature merge style | `--no-ff` (except single commit) | **fast-forward if possible**; pass `--no-ff` |
| Release back-merge | tag → develop (`-b` for branch) | main → develop (no `-b`) |
| Push on finish | `-p`/`--push` (off) | `--push` (off) |
| Fetch on finish | `-F` (off) | on (`--no-fetch` to disable) |
| Resume after conflict | re-run finish | `finish --continue` / `--abort` |
| Tag message | `-m msg` / `-f file` (`-f` = messagefile) | `-m msg` / `--messagefile file` (`-f` = force!) |
| Diff / pull | `feature diff`, `feature pull` | not implemented |

Watch out for `-f`: in AVH `release finish -f FILE` means the message file, but in git-flow-next `-f` means `--force`.

---

## 2. HubFlow

### 2.1 What it is and its status

- DataSift's fork of nvie's gitflow, renamed to avoid confusion. The command is `git hf` [hubflow-tools].
- **Archived on GitHub** (`archived: true`). Last push 2022-06-03, last commit 2022-05-01 ("bump version number to match latest release"), latest tag **v1.5.4**, and `HUBFLOW_VERSION=1.5.4` in `hubflow-common`. 38 open issues remain.
- **The docs site datasift.github.io/gitflow returns 404.** The docs survive in the repo's `gh-pages` branch (`GitFlowForGitHub.md`, `TheHubFlowTools.md`, `IntroducingGitFlow.md`) and in a Wayback snapshot from 2023-05-19.
- No package-manager installs exist (no Homebrew formula, no AUR package found). The only install is:
  ```bash
  git clone https://github.com/datasift/gitflow
  cd gitflow
  sudo ./install.sh
  sudo git hf upgrade      # self-upgrade from GitHub
  ```

### 2.2 How it differs from git-flow

From the docs [hubflow-tools, hubflow-github]:

- "by default, commands push to / pull from GitHub wherever it is appropriate".
- It adds `feature push`/`pull` and the top-level `push`, `pull`, `update`.
- It is designed for one GitHub organisation sharing a repo: "Don't fork repos on GitHub - clone the master repo directly". Feature branches are pushed to origin so others can collaborate, pull requests are opened on the GitHub website, and "Don't accept your own pull requests!"

From the source (v1.5.4):

- **`init` is non-interactive by default.** `git hf init [-af]`: `-a` asks for names, `-f` forces. Defaults are `master`, `develop`, `feature/`, `release/`, `hotfix/`, `support/`, and an empty tag prefix. If there is no repo, it runs `git init`. Config goes under **`[hubflow]`** (`hubflow.branch.master`, `hubflow.branch.develop`, `hubflow.prefix.*`, `hubflow.origin`), not `[gitflow]`. The docs say to run `git hf init` after every clone.
- **`feature start` pushes the new branch to origin immediately.** It requires that local `develop` equals `origin/develop` and that the branch name does not already exist on origin.
- **`feature finish` expects the PR to be already merged on GitHub.** If `git rev-list develop..feature/x` is non-empty it stops with "Please raise a pull-request via GitHub first, or use the -f flag." Otherwise it merges locally (a no-op when already merged), deletes `origin/feature/x`, pushes develop, and deletes the local branch. Consequence (inferred from source, not tested): **if the PR was squash- or rebase-merged on GitHub, the feature commits are not ancestors of develop, so finish refuses and needs `-f`**, which then does a real local merge.
- **Release and hotfix `start`/`finish` fetch and push by default** (`fetch` default true, `push` default true). Finish merges into master, tags with `git tag -a`, back-merges the **tag** into develop (`-b` merges the branch instead), pushes develop, master and `--tags`, and deletes the remote branch.
- **Release finish merges into master with `git merge --no-ff -srecursive -Xtheirs`**, which silently resolves conflicts in favour of the release branch. Hotfix finish does the same.
- There is a `cancel` subcommand (with `-f` as a safety flag) for features, releases and hotfixes.
- **`feature submit` is almost certainly broken (inferred from source, not tested).** It creates the PR through the GitHub API. Its token bootstrap (`github_auth_token`) asks for a username and password and calls `POST https://api.github.com/authorizations`, the OAuth Authorizations API that GitHub removed in 2020. It works only if you set `git config github.oauth.token <PAT>` first. Opening PRs with `gh pr create --base develop` is the practical replacement.
- The docs warn that `hotfix start <ver> <older-tag>` still finishes into the latest master, which "can cause problems, such as master ending up with the wrong version number".

### 2.3 Full command set (v1.5.4 usage strings)

```bash
git hf init [-af]
git hf feature [list] [-v]
git hf feature start <name> [<base>]          # -F/--nofetch to skip fetch; pushes branch to origin
git hf feature submit [<name>] [<base>]       # opens a GitHub PR via API (see caveat)
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
git hf upgrade
```

The documented daily loop [hubflow-github]:

```bash
git hf feature start ticket-1234
git hf push                   # as you work
git hf update && git merge develop   # each morning, on the feature branch
# open a PR feature/ticket-1234 -> develop on GitHub; a colleague merges it
git hf feature finish ticket-1234
git hf update && git hf release start 2.6.0   # bump version in code, fix bugs on the branch
git hf release finish 2.6.0                    # tags 2.6.0 on master, pushes everything
```

---

## 3. Trunk-based development (TBD)

### 3.1 Definition

"A source-control branching model, where developers collaborate on code in a single branch called 'trunk' ... resist any pressure to create other long-lived development branches by employing documented techniques" [tbd-home]. The site calls TBD a key enabler of CI and CD. DORA calls it "a required practice for continuous integration" [dora].

The site states: "Git Flow is incompatible with Trunk-Based Development" [tbd-alt]. It describes GitHub flow as "very close to PR-centric Trunk-Based Development", the difference being that GitHub flow can deploy from the branch before the merge [tbd-alt].

### 3.2 Two styles

**Committing straight to trunk** [tbd-straight]: suited to small teams with fast, thorough builds. Before each push, pull or rebase onto trunk and run the same build CI runs: "an essential integration activity". Pairing counts as review. Risks: semantic conflicts that merge cleanly but break the build ("only the build can" catch them), and broken commits pulled by teammates before CI flags them. Mitigations: a revert policy, a rotating build cop, automated reverts.

**Short-lived feature branches** [tbd-slfb], the norm at scale and the PR-centric style:

- The branch "should only last a couple of days". "Any longer than two days, and there is a risk of the branch becoming a long-lived feature branch."
- One developer per branch ("or two if pair-programming"). The branch is not shared for general development, though it may be shared for code review.
- No intermediate merges to trunk. Merge only to close the branch. Delete it after merging.
- Builds and reviews happen on the branch, but artifacts are **not** created or published from it [tbd-home].

DORA's thresholds, from 2016–2017 data [dora]: three or fewer active branches, merge branches to trunk at least once a day, no code freezes or integration phases. The TBD home page adds: commit to trunk at least once every 24 hours.

### 3.3 Code review [tbd-review]

- PRs from short-lived branches are "processed very quickly". "A few minutes for the review is best, and tens of minutes acceptable. More than a hour or two, and you are negatively affecting cycle times." Reviews must not back up, and reviewers should take a pending review before starting new work.
- Rejections must rest on "objective and published reasons", not ownership.
- Extreme Programming shops often count the pair as the review.
- DORA warns that "an overly heavy code-review process" pushes developers to batch changes, and it favours synchronous review [dora].

### 3.4 CI requirements [tbd-ci]

- Developers run the same build script locally that CI runs, before pushing.
- Builds are staged (compile, unit, integration) and fast. On the straight-to-trunk page, about a minute is fast and ten minutes or more is slow.
- Best practice is to verify before the commit lands (PR checks; at high volume, a merge queue, which the site describes without using that name). CI runs again after the merge, with automatic revert and notification on failure.
- Large teams verify each commit separately. Small teams may batch.
- A broken trunk is fixed or reverted immediately.

### 3.5 Unfinished work: feature flags and branch by abstraction

**Feature flags** [tbd-flags]: ship incomplete code turned off. Runtime flags need state that persists and is distributed to every node, while build-time flags decide whether a capability exists in the artifact at all. CI should test the meaningful flag combinations. Remove flags soon after release (the site suggests about a month, with a "review for delete" date). Flags that outlive their purpose are a known failure mode. The "you're doing it wrong" page: "Code that is not ready should not have been merged in the first place", so incomplete work goes behind a flag [tbd-wrong].

**Branch by abstraction** [tbd-bba], named by Stacy Curl in 2007, for long changes made on trunk:

1. Introduce an abstraction around the code to be replaced. Commit, keeping the build green.
2. Write the new implementation behind the abstraction. Commit it switched off.
3. Switch it on for the team. Commit and push.
4. Remove the old implementation.
5. Remove the abstraction.

Rule: "No commit pushed to the shared repository should jeopardize the ability to go live."

### 3.6 Releasing

**Release from trunk** [tbd-rft]: "Teams with a very high release cadence do not need (and cannot use) release branches at all." They roll forward, fixing bugs on trunk "as if it were a feature, albeit as quickly as possible". They tend to version by commit number or date/time rather than semver. The release-from-trunk page does not prescribe tagging. The branch-for-release page says a release can be a tag on trunk (e.g. `v1.1.1`) with "the branch ... avoided completely", and that a branch can be cut later from that tag if a fix is needed [tbd-bfr].

**Branch for release** [tbd-bfr]:

- Cut the branch "just in time", a few days before the release, from a chosen commit (not necessarily HEAD). It gets no further development.
- **Fix bugs on trunk first, with a test, then cherry-pick to the release branch.** Fixing on the release branch and cherry-picking back is discouraged (a forgotten step means a regression). That is allowed only when the bug cannot be reproduced on trunk.
- "Release branches are not merged back into trunk."
- Run the trunk's CI pipeline on active release branches too.
- One person (a rotating "Merge Meister") does the cherry-picks.
- Delete the branch after it leaves production, but tag the released commit first.
- Anti-patterns [tbd-wrong]: merging trunk into the release branch, merging between release branches, keeping one release branch through several major releases, code freezes, and fixing on the release branch then merging down.

Plain-git sketch (my synthesis; the site gives no exact commands):

```bash
# Short-lived branch flow
git switch -c fix-login origin/main      # or: work directly on main for straight-to-trunk teams
git pull --rebase origin main            # sync often; branch lives hours to ~2 days
# run the full local build/tests, then push and open a PR; merge same day; delete branch

# Release from trunk with a tag
git tag -a v1.4.0 -m "v1.4.0" <sha-on-main> && git push origin v1.4.0

# Branch for release, cut late, fixes cherry-picked from trunk
git branch release/1.4 v1.4.0            # or from a chosen main commit
git switch main                          # fix lands on trunk first, with a test
git switch release/1.4 && git cherry-pick -x <fix-sha>
git tag -a v1.4.1 -m "v1.4.1" && git push origin release/1.4 v1.4.1
# never merge release/1.4 back into main
```

### 3.7 Scaled TBD

The home page: "Scaled Trunk-Based Development" uses short-lived feature branches for review and CI, with no artifacts built from them. At very large scale the site mentions patch-review systems (Gerrit, Phabricator), with pending changes held outside the VCS, and Google's model of verifying each commit before it lands at a commit every ~30 seconds [tbd-styles, tbd-ci]. Monorepos and "concurrent development of consecutive releases" (via flags and branch by abstraction) are covered on their own pages, which I did not read in detail.

Factors that work against TBD [tbd-decide]: waterfall, fixed iterations of four weeks or more, large stories, slow builds, very high commit rates on plain Git ("race to push"), and database migrations not under source control.

---

## 4. When to use which

| | git-flow (git-flow-next) | HubFlow | Trunk-based development |
|---|---|---|---|
| Fits | Explicitly versioned software, or several versions supported in the wild: libraries, SDKs, desktop/mobile/embedded apps, on-prem products. Releases are batched and sometimes gated (QA sign-off, regulated release). Driessen: "may still be as good of a fit" | Same release shape as git-flow, for a team in one GitHub org on a shared repo that wants every branch on origin and PR-reviewed features | Continuously delivered services and web apps, one version in production, high deploy frequency. Required for CI per DORA |
| Avoid when | Continuous delivery. Driessen: "adopt a much simpler workflow (like GitHub flow)" | Almost always for new adoption: archived, docs offline, GitHub auth bootstrap broken, `-Xtheirs` merges. Use it only when a repo already uses it | Waterfall or long fixed iterations, slow or flaky CI, no feature-flag or automated-test discipline, large unsplittable stories (tbd-decide) |
| Branches | `main` + `develop` long-lived; feature, release, hotfix, support | Same (master + develop) | One trunk. Optional short-lived branches (≤ ~2 days, 1 dev). Optional late-cut release branches |
| Release | `release/x` from develop → merge to main, tag, back-merge to develop | `git hf release finish` (auto-push) | Tag on trunk, or cut a release branch; fixes cherry-picked from trunk, never merged back |
| Multiple supported versions | `support/*` from old tags; hotfix per line | `support start` exists but is minimal | Release branches per version, cherry-picked from trunk |
| Team size / CI maturity | Works with weaker CI (the release branch is the stabilisation phase), but DORA counts integration phases and code freezes against delivery performance | Same | Needs fast, reliable CI and pre-merge checks. Straight-to-trunk for small teams, short-lived PR branches at scale |

The sources disagree here. trunkbaseddevelopment.com says Git Flow is "incompatible" with TBD and lists "GitFlow considered harmful" as further reading [tbd-alt]. Driessen does not claim universality: git-flow is for versioned, multi-version software, and continuous delivery teams should use something simpler [nvie]. DORA reports that long-lived branches, integration phases and code freezes correlate with lower delivery performance, without naming git-flow [dora]. The two positions are compatible: they agree on continuous delivery and differ only on whether versioned software needs `develop` at all (TBD would release versioned software from trunk tags and release branches instead).

**Possible blurbs for the skills:**

- *git-flow:* use when the repo ships numbered releases, may support several versions at once, and stabilises releases on a branch before tagging. Not for continuously deployed services (use trunk-based or GitHub flow). Prefer git-flow-next and pass `--no-ff` for Driessen-style history.
- *HubFlow:* use only in repos already set up with `git hf` (a `[hubflow]` section in `.git/config`). It is git-flow plus automatic pushing and GitHub PRs for features. The tool is archived, so for a new repo choose git-flow-next or trunk-based instead.
- *Trunk-based:* use when the team deploys continuously from one main branch, keeps branches to hours or a couple of days, hides unfinished work behind flags, and has fast CI gating every merge. Use release branches only when a shipped version needs patching, cherry-picking from trunk.

---

## 5. Detecting the model a repo already uses

Check in this order; the strongest signals come first.

```bash
# 1. Tool config in the local repo (not committed, so present only if someone ran init in this clone)
git config --get-regexp '^gitflow\.'    # any output → git-flow tooling initialised
git config --get-regexp '^hubflow\.'    # any output → HubFlow (git hf)
#   gitflow.branch.master + gitflow.prefix.*                       → nvie/AVH-style config
#   gitflow.initialized / gitflow.version / gitflow.branch.<x>.type → git-flow-next
test -f .gitflow && cat .gitflow         # committed shared config → git-flow-next ≥ 2.0 (classic/github/gitlab preset)

# 2. Branch topology on the remote
git ls-remote --heads origin | awk '{print $2}' | sed 's#refs/heads/##' | sort
#   develop (or dev/integration) alongside main/master          → git-flow / HubFlow
#   release/*, hotfix/*, support/*, feature/*, bugfix/*         → git-flow family
#   only main + a few short-lived branches, maybe release/*     → TBD or GitHub flow
git for-each-ref --sort=-committerdate refs/remotes/origin --format='%(committerdate:short) %(refname:short)'
#   many feature branches weeks old → not TBD
#   release/* branches that were never merged back into main → TBD branch-for-release

# 3. History shape
git log --merges --oneline -20 origin/main
#   "Merge branch 'release/1.2'", "Merge tag '1.2' into develop", "Merge branch 'hotfix/…'" → git-flow (AVH/HubFlow if tag back-merges)
#   "Merge branch 'main' into develop" on develop → git-flow-next
git log --oneline -20 origin/main         # linear, frequent small commits/squash merges → TBD/GitHub flow
git tag --sort=-creatordate | head        # semver tags on main merge commits → git-flow; tags on trunk commits → TBD release-from-trunk
git log --grep='cherry picked from commit' --oneline --all | head   # cherry-pick -x on release branches → TBD branch-for-release

# 4. CI and repo settings
grep -rnE 'develop|release/|hotfix/|feature/' .github/workflows .gitlab-ci.yml azure-pipelines.yml Jenkinsfile 2>/dev/null
#   push/pull_request filters on develop, release/**, hotfix/** → git-flow
#   only main (+ merge_group / merge queue) → TBD
gh repo view --json defaultBranchRef --jq .defaultBranchRef.name   # default branch "develop" → git-flow/HubFlow
gh api repos/{owner}/{repo}/branches/main/protection 2>/dev/null   # required checks on main
grep -rniE 'git ?flow|hubflow|git hf|trunk' CONTRIBUTING* README* docs/ 2>/dev/null

# 5. Feature flag libraries (supporting evidence for TBD)
grep -rlE 'launchdarkly|unleash|flagsmith|openfeature|growthbook|split\.io' --include='package.json' --include='*.csproj' --include='go.mod' --include='requirements*.txt' . 2>/dev/null
```

Caveats: `[gitflow]`/`[hubflow]` config lives in `.git/config` and is per clone, so a fresh clone of a git-flow repo has none. Look at branches and CI first and offer to run `git flow init -d` (or `git hf init`). A `develop` branch alone is weak evidence, because some teams keep one as a staging branch. GitHub flow (main plus PR branches, deploy from main) looks like PR-style TBD; the difference is in branch lifetime and whether releases are tagged or cut.

---

## 6. Unresolved or unconfirmed

- **Homebrew `git-flow-avh` formula:** the API returns 404, so it looks removed, but I could not find when or why.
- **git-flow-next WinGet ID** (`GitTower.GitFlowNext`) comes from the README only. I did not query the winget repo. Scoop 2.1.0 is confirmed via Repology.
- **HubFlow `feature submit` auth failure and squash-merge `finish` refusal** are inferred from source and were not run against GitHub.
- **HubFlow docs site** is offline. Content was taken from the `gh-pages` branch (same text as the 2023-05-19 Wayback snapshot, which was not fetched in full).
- **trunkbaseddevelopment.com "Styles" page:** my fetch tool summarised a committer-range table (e.g. "1 to 100", "2 to 1,000"). I could not verify those numbers verbatim, so they are left out above.
- **DORA capability page** has no visible date. Its thresholds cite 2016–2017 State of DevOps data (the basis of *Accelerate*, 2018).
- **git-flow-next 1.2.0 changelog** ("finish now pushes branches and tags") reads like push-by-default. The 2.1.0 man page and the observed behaviour show no push without `--push`.
- **git-flow-next AVH compatibility doc** (2026-02-01) says init lacks `--local/--global/--system/--file`, but the 2.1.0 man page documents them. Trust the man page.
- I did not test nvie 0.4.1 or HubFlow by running them; their behaviour above comes from source.

---

## Sources (all accessed 2026-10-18)

- [nvie] Vincent Driessen, "A successful Git branching model", including the "Note of reflection (March 5, 2020)": https://nvie.com/posts/a-successful-git-branching-model/
- nvie/gitflow (archived 2025-10-14, README points to git-flow-next): https://github.com/nvie/gitflow
- petervanderdoes/gitflow-avh (archived 2023-06-19; 1.12.3 released 2019-05-23): https://github.com/petervanderdoes/gitflow-avh, source files `git-flow-init`, `git-flow-feature`, `git-flow-release`, `git-flow-hotfix`, `git-flow-support`
- gittower/git-flow-next (v2.1.0, 2026-09-08): https://github.com/gittower/git-flow-next, including `CONFIGURATION.md`, `docs/git-flow-init.1.md`, `docs/git-flow-finish.1.md`, `docs/avh-compatibility-analysis.md`, `internal/config/resolver.go`, `internal/git/repo.go`
- git-flow-next site, changelog, installation and command reference: https://git-flow.sh, https://git-flow.sh/changelog, https://git-flow.sh/docs/installation, https://git-flow.sh/docs/commands
- git-flow-next releases: https://github.com/gittower/git-flow-next/releases
- Homebrew formula API: https://formulae.brew.sh/api/formula/git-flow.json, https://formulae.brew.sh/api/formula/git-flow-next.json (git-flow-avh.json → 404)
- Debian sources (`git-flow` 1.12.3-3, AVH): https://sources.debian.org/src/git-flow/ ; Ubuntu Launchpad publishing history for `git-flow`
- Repology git-flow-next: https://repology.org/project/git-flow-next ; AUR: https://aur.archlinux.org/packages/gitflow-next-bin, https://aur.archlinux.org/packages/gitflow-avh
- [hubflow-src] datasift/gitflow (archived, v1.5.4): https://github.com/datasift/gitflow, source files `git-hf*`, `hubflow-common`
- [hubflow-tools] / [hubflow-github] HubFlow docs, `gh-pages` branch (`TheHubFlowTools.md`, `GitFlowForGitHub.md`): https://github.com/datasift/gitflow/tree/gh-pages ; archived site: http://web.archive.org/web/20230519194833/https://datasift.github.io/gitflow/GitFlowForGitHub.html (live site https://datasift.github.io/gitflow/ → 404)
- [tbd-home] https://trunkbaseddevelopment.com/
- [tbd-straight] https://trunkbaseddevelopment.com/committing-straight-to-the-trunk/
- [tbd-slfb] https://trunkbaseddevelopment.com/short-lived-feature-branches/
- [tbd-review] https://trunkbaseddevelopment.com/continuous-review/
- [tbd-ci] https://trunkbaseddevelopment.com/continuous-integration/
- [tbd-flags] https://trunkbaseddevelopment.com/feature-flags/
- [tbd-bba] https://trunkbaseddevelopment.com/branch-by-abstraction/
- [tbd-bfr] https://trunkbaseddevelopment.com/branch-for-release/
- [tbd-rft] https://trunkbaseddevelopment.com/release-from-trunk/
- [tbd-styles] https://trunkbaseddevelopment.com/styles/
- [tbd-wrong] https://trunkbaseddevelopment.com/youre-doing-it-wrong/
- [tbd-alt] https://trunkbaseddevelopment.com/alternative-branching-models/
- [tbd-decide] https://trunkbaseddevelopment.com/deciding-factors/
- [dora] DORA, "Capabilities: Trunk-based development": https://dora.dev/capabilities/trunk-based-development/
- GitHub flow: https://docs.github.com/en/get-started/using-github/github-flow
