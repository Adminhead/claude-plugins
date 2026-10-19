# Plain-git equivalents (Driessen's sequences)

Use when no git-flow CLI is installed. `main` stands for `master` in older repos. Branch prefixes follow the repo (the article uses `release-1.2`; the CLIs use `release/1.2`). The article never pushes; pushing is a separate step that needs the user's go-ahead.

```bash
# Feature
git checkout -b feature/NAME develop
# ...commits...
git checkout develop
git merge --no-ff feature/NAME
git branch -d feature/NAME
# then, with approval: git push origin develop

# Release
git checkout -b release/1.2 develop
./bump-version.sh 1.2                       # repo's own version bump
git commit -a -m "Bumped version number to 1.2"
# ...release fixes only, no new features...
git checkout main
git merge --no-ff release/1.2
git tag -a 1.2                              # -s or -u <key> to sign
git checkout develop
git merge --no-ff release/1.2               # may conflict on the version bump; resolve and commit
git branch -d release/1.2
# then, with approval: git push origin main develop --follow-tags

# Hotfix
git checkout -b hotfix/1.2.1 main
./bump-version.sh 1.2.1
git commit -a -m "Bumped version number to 1.2.1"
git commit -m "Fixed severe production problem"
git checkout main
git merge --no-ff hotfix/1.2.1
git tag -a 1.2.1
git checkout develop                        # or the open release branch, see SKILL.md
git merge --no-ff hotfix/1.2.1
git branch -d hotfix/1.2.1
```

Why `--no-ff`: it always records a merge commit, so a feature's commits stay grouped and one revert undoes the feature. The cost is some empty merge commits, which Driessen considers worth it.

A support branch (tooling only, not in the article) is a long-lived branch from an old tag to maintain an old major version: `git checkout -b support/1.x v1.0.0`.
