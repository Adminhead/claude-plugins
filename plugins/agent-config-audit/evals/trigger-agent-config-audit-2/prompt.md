---
name: trigger-agent-config-audit-2
description: A realistic request that should load agent-config-audit:agent-config-audit.
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

I just cloned an unfamiliar repo and it has a .claude/ directory with settings.json, two hooks scripts and a CLAUDE.md. Before I open it in Claude Code, is it safe to trust? What should I look for?
