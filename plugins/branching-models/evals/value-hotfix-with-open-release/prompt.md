---
name: value-hotfix-with-open-release
description: Value case. A git-flow repo with release/1.4 open and a hotfix/1.3.1 ready to finish; does the bare model merge the hotfix into main, tag it, and carry it into the open release branch rather than only into develop. Needs --scaffold and --allow-tools Edit Write Bash.
tags: [value]
runs: 3
max_turns: 20
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
---

hotfix/1.3.1 has the fix and is ready. finish it the git-flow way: merge it where it belongs, tag it 1.3.1, and delete the hotfix branch. local only, don't push anything. when you're done, tell me which branches it ended up in and paste `git log --oneline -4 release/1.4`.
