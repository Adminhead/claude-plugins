---
name: value-trunk-repo-git-flow-vocabulary
description: Value case. A trunk-based repo with a branch-for-release layout and no develop branch, and a user asking in git-flow words to finish the release into main and develop; does the bare model follow the repo's model or ask, or does it merge the release branch back and create develop. Needs --scaffold and --allow-tools Edit Write Bash.
tags: [value]
runs: 3
max_turns: 20
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
---

release/1.3 has the 1.3.1 fix on it now. do `git flow release finish 1.3.1` for me: merge it into main and develop and tag it v1.3.1. local only, don't push anything.
