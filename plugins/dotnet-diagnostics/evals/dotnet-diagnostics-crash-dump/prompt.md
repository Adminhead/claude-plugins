---
name: dotnet-diagnostics-crash-dump
description: A request to capture crash dumps from a .NET process routes to dotnet-diagnostics.
tags: [routing]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

A .NET 10 worker service on an Ubuntu VM dies a couple of times a day with no useful log line. How do I get a dump written automatically the next time it crashes, and how do I grab one from the live process right now if it starts hanging?
