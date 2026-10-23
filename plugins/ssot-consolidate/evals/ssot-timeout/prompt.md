---
name: ssot-timeout
description: "A fact scattered across disagreeing docs routes to ssot-consolidate."
tags: [routing]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

The request timeout is mentioned in four of our docs and they disagree. Find every place and get it down to one source of truth.
