---
name: nuget-negative-csharp
description: A C# async bug does not route to nuget.
tags: [routing, negative]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

This C# method sometimes throws ObjectDisposedException in production: it starts a Task.Run that uses the injected DbContext and returns before the task finishes. Can you explain the bug and fix it?
