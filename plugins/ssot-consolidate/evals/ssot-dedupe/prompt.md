---
name: ssot-dedupe
description: "Finding a canonical home for a repeated definition routes to ssot-consolidate."
tags: [routing]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

Our retry policy is described in the README, the runbook and two plans. Work out where it should live and replace the other copies with references.
