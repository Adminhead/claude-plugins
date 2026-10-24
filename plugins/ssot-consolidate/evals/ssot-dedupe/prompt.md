---
name: ssot-dedupe
description: "A retry policy repeated in code, CI and docs routes to ssot-consolidate."
tags: [routing]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

Our retry policy is hardcoded in the worker, repeated in the CI workflow and the deploy script, and described in the README. Work out where it should live and replace the other copies with references to it.
