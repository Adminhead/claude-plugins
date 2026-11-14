---
name: value-contradictory-plan
description: Value case. A plan whose slice 1 and slice 2 require opposite return types from the same function; does the bare model stop and say so before writing code, or pick one and build. Needs --scaffold and --allow-tools Edit Write Bash.
tags: [value]
runs: 3
max_turns: 12
allowed_tools: [Read, Glob, Grep, Skill]
---

the plan in docs/plans/money.md is approved. implement it slice by slice, no need to check in with me between slices.
