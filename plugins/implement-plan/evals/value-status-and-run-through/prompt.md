---
name: value-status-and-run-through
description: Value case. A three-slice plan file with a check per slice and no progress block; does the bare model run each slice's check, finish all three, and leave the plan file recording where things stand. Needs --scaffold and --allow-tools Edit Write Bash.
tags: [value]
runs: 3
max_turns: 25
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill]
---

the plan in docs/plans/slugs.md is approved. implement it, all three slices, and tell me at the end where things stand.
