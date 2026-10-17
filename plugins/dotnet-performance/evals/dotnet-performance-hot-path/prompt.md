---
name: dotnet-performance-hot-path
description: A slow, allocation-heavy C# parser on a request path routes to dotnet-performance.
tags: [routing]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

Our ASP.NET Core service spends most of its CPU in `LogLineParser.Parse`, which does a lot of `Substring`, `ToLower()` and LINQ per line, and GC is running constantly. Can you review that hot path for what is costing us and tell me which fixes are worth it?
