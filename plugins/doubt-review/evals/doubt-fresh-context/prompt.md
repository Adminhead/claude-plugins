---
name: doubt-fresh-context
description: "Upstream positive trigger: adversarial fresh-context review should load doubt-review."
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

I am not confident in this approach. Adversarially review my reasoning in a fresh context: I claim this retry wrapper is idempotent because every request carries a client-generated UUID that the server dedupes on for 24 hours.
