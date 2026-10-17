---
name: trigger-review-1
description: A pre-release review of our own MCP server should load mcp-server-review:mcp-server-review.
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

We're about to publish v1.0 of our Python MCP server (src/acme_mcp/, Streamable HTTP, OAuth bearer tokens). Can you do a security and release-readiness review before we tag it? Check auth, Origin handling, and whether the tool schemas match the README.
