---
name: vet-inbox
description: Triaging the tools-to-research inbox routes to vet.
tags: [routing]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

Go through the inbox in docs/research/tools-to-research.md and tell me which links are worth stealing from.
