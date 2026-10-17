---
name: trigger-ai-agent-tools
description: "A tool-calling agent in C# should load dotnet-ai-apps."
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

Build a C# support agent that can look up orders and issue refunds through our OrderService, decides on its own which tool to call over several steps, and can't run away with tokens. We're on .NET 10.
