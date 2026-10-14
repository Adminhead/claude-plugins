---
name: implement-plan-routing
description: A request to carry out an approved multi-slice plan file routes to implement-plan, not planning or coding.
tags: [routing]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

The plan in docs/plans/billing-migration.md is approved, including a commit per slice. Implement it: work through the slices, check and review each one, commit it, update the plan's status, and keep going to the next slice without asking me each time.
