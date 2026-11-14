---
name: trigger-sdk-wiring
description: Wiring an OpenFeature provider for GO Feature Flag into app code routes to goff without the prompt naming the skill.
tags: [routing]
max_turns: 5
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

we run go-feature-flag and I need our Express API (src/server.ts) to evaluate flags per request using the logged-in user's id, through OpenFeature. also we want a "checkout_completed" event recorded against the flag data. can you wire up the provider?
