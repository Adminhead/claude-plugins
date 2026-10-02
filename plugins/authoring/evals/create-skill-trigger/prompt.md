---
name: create-skill-trigger
description: Writing a new skill routes to authoring:create-skill.
tags: [routing]
runs: 1
max_turns: 5
allowed_tools: [Read, Glob, Grep, Skill]
---

Write a new Claude Code skill that helps with rotating API keys safely: it should trigger when someone asks to rotate, revoke, or audit credentials, and keep the SKILL.md lean with details in references/. Set it up for me.
