---
name: review-loop-routing
description: A request to review a branch and fix findings until approved routes to review-loop, not second-opinion.
tags: [routing]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

I finished the retry-logic change on this branch. Review it, have the findings fixed, and re-review only what was flagged. Keep going until the reviewer approves, but stop after three rounds and tell me what is still open.
