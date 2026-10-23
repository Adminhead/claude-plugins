---
name: leakage-audit-grader
description: "A same-model-grader worry routes to leakage-audit."
tags: [routing]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

Our eval grader was written by the same model that produced the answers. Is that a problem?
