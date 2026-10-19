---
name: trunk-based
description: Works in a repo that practises trunk-based development (one trunk, commits straight to main or short-lived branches of a day or two, feature flags, branch by abstraction, late-cut release branches with cherry-picks from trunk, tags on trunk). Use when asked for "trunk-based", "trunk based development", "short-lived branches", "feature flag unfinished work", "branch by abstraction", "release branch cherry-pick", "release from trunk", or "which branching model should we use". Not for git-flow or develop-branch repos (git-flow), HubFlow (hubflow), commit messages or branch names (git-commit), history spelunking (git-history) or GitHub releases (gh-release).
---

# Trunk-based development

One branch, `main` (the trunk), that everyone integrates into at least daily. Optional short-lived branches. Unfinished work is hidden, not parked on a long-lived branch.

## Safety rules

- Run `git status` first.
- Never push, force-push, delete remote branches, or tag-and-push without the user's go-ahead. Show the command and ask. Pushing to trunk is itself a push: ask even for a one-line fix.
- Branch naming and commit messages: defer to the `git-commit` skill when it is installed.

## When to use this model

Use it when the team deploys continuously from one main branch, one version runs in production, branches last hours to a couple of days, unfinished work sits behind flags, and fast CI gates every merge. DORA calls it a required practice for CI.

Suggest a different model when:
- The software is explicitly versioned and several versions are supported in the wild, releases are gated, and the team wants a stabilisation branch: `git-flow` (git-flow-next). Note the sources disagree: trunkbaseddevelopment.com says Git Flow is incompatible with TBD, while git-flow's author says it still fits versioned software. TBD would release such software from trunk tags and release branches instead.
- Waterfall or fixed iterations of four weeks or more, large unsplittable stories, slow or flaky CI, no test or flag discipline, database migrations not under source control: TBD is likely a poor fit. GitHub flow (main plus PR branches, deploy from main) is the simpler option and is "very close to PR-centric" TBD, differing mainly in that it can deploy from the branch before merging.
- The repo uses `[hubflow]` config: the `hubflow` skill.

Do not restructure a repo's branching uninvited; suggest.

## Detect first

```bash
git config --get-regexp '^(gitflow|hubflow)\.'      # any output: git-flow family, not this model
git ls-remote --heads origin | awk '{print $2}' | sed 's#refs/heads/##' | sort
git log --oneline -20 origin/main                    # linear, small commits or squash merges
git for-each-ref --sort=-committerdate refs/remotes/origin --format='%(committerdate:short) %(refname:short)'
grep -rnE 'develop|release/|hotfix/' .github/workflows .gitlab-ci.yml 2>/dev/null
```

- `develop` plus release/hotfix branches, `[gitflow]` config, or weeks-old feature branches: not trunk-based. Say so and defer to `git-flow` or `hubflow` when installed; do not impose this skill.
- Only `main`, short-lived branches, CI on `main` (maybe merge queue), flag libraries in dependencies, `cherry picked from commit` lines on `release/*`: trunk-based, proceed.
- `release/*` branches never merged back to main is the branch-for-release pattern, not git-flow.

More signals: [references/detection.md](references/detection.md).

## Working on trunk

Pick the style the repo already uses.

**Straight to trunk** (small teams, fast thorough builds; pairing counts as review):
```bash
git pull --rebase origin main      # sync
# run the same build/tests CI runs, locally
git push origin main               # ask first
```
Risks: semantic conflicts that merge cleanly but break the build; teammates pulling a broken commit before CI flags it. Revert a broken trunk commit immediately (`git revert <sha>`), do not leave it red.

**Short-lived branch** (the norm at scale):
```bash
git switch -c fix-login origin/main
git pull --rebase origin main      # sync often
# full local build/tests, then push and open a PR (ask first); merge the same day; delete the branch
```
- Lifetime hours to about two days; one developer per branch; no intermediate merges to trunk (merge once, to close it); delete after merging.
- Build and review on the branch, but never create or publish release artifacts from it.
- Commit to trunk at least once every 24 hours. Aim for three or fewer active branches (DORA).
- Keep reviews quick: minutes ideal, tens of minutes acceptable, over an hour or two hurts cycle time.

## Unfinished work

- **Feature flag**: ship the code switched off. Runtime flags need state distributed to every node; build-time flags decide whether the capability exists in the artifact. Test the meaningful flag combinations. Remove the flag soon after release (about a month) and record a "review for delete" date. Incomplete code that is not behind a flag should not have been merged.
- **Branch by abstraction** for a long replacement, all on trunk: (1) introduce an abstraction around the code to replace and commit, build green; (2) write the new implementation behind it, committed switched off; (3) switch it on for the team, commit and push; (4) remove the old implementation; (5) remove the abstraction. No commit pushed to the shared repo may jeopardise the ability to go live.

## Releasing

Pick from the repo's practice; see [references/release.md](references/release.md) for the exact plain-git sequences.

- **Release from trunk**: very high cadence teams need no release branches. Fix bugs on trunk as if they were features, roll forward. Version by commit number or date/time rather than semver, unless the repo does otherwise. A release may be just a tag on a trunk commit.
- **Branch for release**: cut `release/X.Y` just in time, a few days before the release, from a chosen commit (not necessarily HEAD) or from the release tag. **Fix on trunk first, with a test, then `git cherry-pick -x` to the release branch.** Fix on the release branch only when the bug cannot be reproduced on trunk, and then cherry-pick it back to trunk. **Never merge the release branch back into trunk.** Run the trunk CI pipeline on active release branches. Delete the branch once it is out of production, after tagging the released commit.

## Gotchas

- Anti-patterns to refuse or flag: merging trunk into a release branch, merging between release branches, one release branch across several major releases, code freezes, fixing on the release branch then merging down.
- Large changes do not justify a long-lived branch; use a flag or branch by abstraction.
- At very high commit rates on plain Git, pushes race; a merge queue or verify-before-land setup helps. Do not invent one; use what the repo has.
