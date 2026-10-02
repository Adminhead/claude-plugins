---
name: trigger-design-2
description: A realistic request that should load mcp:design.
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

Our MCP server exposes `get_ticket`, `list_tickets`, `search_tickets`, `get_ticket_v2` and agents keep calling the wrong one. We're also about to add `delete_ticket` and `bulk_close`. How should we restructure the tool set and what safeguards do the write tools need?
