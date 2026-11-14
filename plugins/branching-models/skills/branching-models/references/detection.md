# Detecting a repo's branching model

Read when the quick check in SKILL.md is inconclusive. Strongest signals first.

```bash
# 1. Tool config (per clone, not committed)
git config --get-regexp '^gitflow\.'    # nvie/AVH: gitflow.branch.master + gitflow.prefix.*; git-flow-next: gitflow.initialized / gitflow.branch.<x>.type
git config --get-regexp '^hubflow\.'    # HubFlow (git hf)
test -f .gitflow && cat .gitflow         # committed shared config, git-flow-next 2.0+

# 2. Branch topology
git ls-remote --heads origin | awk '{print $2}' | sed 's#refs/heads/##' | sort
#   develop beside main/master, plus release/* hotfix/* support/* feature/* bugfix/* -> git-flow family
#   only main plus a few short-lived branches, maybe release/* -> trunk-based or GitHub flow
git for-each-ref --sort=-committerdate refs/remotes/origin --format='%(committerdate:short) %(refname:short)'
#   many feature branches weeks old -> not trunk-based

# 3. History shape
git log --merges --oneline -20 origin/main
#   "Merge branch 'release/1.2'", "Merge tag '1.2' into develop", "Merge branch 'hotfix/...'" -> git-flow (AVH/HubFlow if tag back-merges)
#   "Merge branch 'main' into develop" on develop -> git-flow-next
git tag --sort=-creatordate | head       # semver tags on main merge commits -> git-flow
git log --grep='cherry picked from commit' --oneline --all | head   # trunk-based branch-for-release

# 4. CI and docs
grep -rnE 'develop|release/|hotfix/|feature/' .github/workflows .gitlab-ci.yml azure-pipelines.yml Jenkinsfile 2>/dev/null
gh repo view --json defaultBranchRef --jq .defaultBranchRef.name    # default branch develop -> git-flow/HubFlow
grep -rniE 'git ?flow|hubflow|git hf|trunk' CONTRIBUTING* README* docs/ 2>/dev/null
```

A `develop` branch alone is weak evidence (some teams keep one as staging). GitHub flow looks like PR-style trunk-based; the difference is branch lifetime and whether releases are tagged or cut.
