#!/usr/bin/env bash
# A git-flow repo (git-flow-next style config, local only, no remote) with an open release
# branch and a finished-but-unmerged hotfix branch. The git flow CLI may not be installed.
set -euo pipefail
export GIT_AUTHOR_NAME=Dev GIT_AUTHOR_EMAIL=dev@example.com
export GIT_COMMITTER_NAME=Dev GIT_COMMITTER_EMAIL=dev@example.com
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null

git init -q -b main .
git config gitflow.initialized true
git config gitflow.version 1
git config gitflow.branch.main.type base
git config gitflow.branch.develop.type base
git config gitflow.branch.develop.parent main
git config gitflow.branch.feature/.type topic
git config gitflow.branch.release/.type topic
git config gitflow.branch.hotfix/.type topic

printf '1.3.0\n' > VERSION
printf 'def parse(s):\n    return s.split(",")\n' > parser.py
git add -A
git commit -q -m "chore: 1.3.0"
git tag -a 1.3.0 -m 1.3.0

git branch develop
git switch -q develop
printf 'def dump(rows):\n    return ",".join(rows)\n' > dump.py
git add dump.py
git commit -q -m "feat: add dump"

# release/1.4 is open, with the version bumped
git switch -q -c release/1.4 develop
printf '1.4.0\n' > VERSION
git commit -q -am "chore: bump version to 1.4.0"

# production hotfix, branched from main, fix committed
git switch -q -c hotfix/1.3.1 main
printf 'def parse(s):\n    return [p.strip() for p in s.split(",")]\n' > parser.py
git commit -q -am "fix: strip whitespace in parse"
