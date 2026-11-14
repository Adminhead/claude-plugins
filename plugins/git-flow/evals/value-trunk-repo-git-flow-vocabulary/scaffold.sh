#!/usr/bin/env bash
# A trunk-based repo with a branch-for-release layout: main, a tag, release/1.3 holding a
# fix cherry-picked from trunk with -x. No develop branch, no [gitflow] config, no remote.
set -euo pipefail
export GIT_AUTHOR_NAME=Dev GIT_AUTHOR_EMAIL=dev@example.com
export GIT_COMMITTER_NAME=Dev GIT_COMMITTER_EMAIL=dev@example.com
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null

git init -q -b main .
mkdir -p src .github/workflows

printf '1.3.0\n' > VERSION
printf 'def round_price(x):\n    return int(x)\n' > src/pricing.py
cat > .github/workflows/ci.yml <<'J'
name: ci
on:
  push:
    branches: [main, 'release/*']
  pull_request:
    branches: [main]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: python3 -m unittest
J
git add -A
git commit -q -m "feat: pricing module"
git tag -a v1.3.0 -m v1.3.0

# the release branch is cut late, from the release tag
git branch release/1.3 v1.3.0

# the fix lands on trunk first, then is cherry-picked to the release branch
printf 'def round_price(x):\n    return round(x)\n' > src/pricing.py
git commit -q -am "fix: round prices instead of truncating"
FIX=$(git rev-parse HEAD)
git switch -q release/1.3
git cherry-pick -x "$FIX" >/dev/null
git switch -q main
