---
name: dotnet-diagnostics-high-cpu-windows
description: Production high CPU on a Windows .NET Framework app routes to dotnet-diagnostics, not problem-solving.
tags: [routing]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

Our legacy .NET Framework 4.8 Windows service pegs a core at 100% for a few minutes at random times, usually overnight. I have admin on the box. How do I capture what it's doing during the spike without recording gigabytes of trace all night?
