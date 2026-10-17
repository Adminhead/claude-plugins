---
name: trigger-design-1
description: A realistic request that should load mcp:design.
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

Design the tools for an MCP server that wraps our ticketing API. The API has about 40 endpoints (tickets, comments, labels, assignees, boards, sprints, webhooks). Agents will use it to triage and update tickets.
