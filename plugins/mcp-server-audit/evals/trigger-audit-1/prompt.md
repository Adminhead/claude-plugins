---
name: trigger-audit-1
description: Vetting a third-party MCP server before installing it should load mcp-server-audit:mcp-server-audit.
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

A teammate added a community "notes-sync" MCP server to our project .mcp.json. Before I approve it in Claude Code, can you check whether its tool descriptions hide instructions or could change later, and whether anything else in my MCP config looks risky?
