---
name: route-build-vs-mcp-integration
description: Writing an MCP server goes to mcp:build (positive only; plugin-dev is a different plugin).
tags: [routing]
runs: 1
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
model: claude-sonnet-5-5
---

Help me write an MCP server in TypeScript with the official SDK. It should expose two tools, `lookup_order` and `refund_order`, over Streamable HTTP, with structured tool errors, and I want to test it with the MCP Inspector.
