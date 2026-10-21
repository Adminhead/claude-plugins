---
name: sbt2-commands
description: sbt 2.0.11 CI workflow where green tests are skipped after clean; the fix needs the correct sbt 2 command form.
tags: [outcome]
runs: 3
max_turns: 12
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Edit, Write, Bash, Skill]
---

this repo builds with sbt 2.0.11 (see project/build.properties). reviewers say that tests which passed last week never run on CI anymore, even though the job cleans first. the test step lives in .github/workflows/ci.yml. update that step so every test runs on each CI build, keep it working on sbt 2, and reply with the exact run line you ended up with and one sentence on why it changed.
