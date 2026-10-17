---
name: agent-config-audit-routing
description: Reviewing .claude config for security routes to authoring:agent-config-audit.
tags: [routing]
runs: 1
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
model: claude-sonnet-5-5
---

Before I trust this cloned repo, review its .claude/settings.json, .mcp.json, and hooks for injected instructions, over-broad permissions, and unpinned MCP packages.
