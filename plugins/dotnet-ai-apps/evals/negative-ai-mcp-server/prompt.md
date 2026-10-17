---
name: negative-ai-mcp-server
description: "Building an MCP server in C# belongs to mcp-server, not dotnet-ai-apps."
tags: [negative]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

Write an MCP server in C# with the ModelContextProtocol SDK that exposes our inventory database as two tools (search_items, get_stock) over stdio.
