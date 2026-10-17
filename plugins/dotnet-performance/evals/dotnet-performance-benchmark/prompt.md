---
name: dotnet-performance-benchmark
description: A BenchmarkDotNet comparison request routes to dotnet-performance.
tags: [routing]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

I rewrote our base64url encoder in C# to use spans. How do I set up a BenchmarkDotNet comparison of the old and new versions on net8.0 and net10.0, and read the results so I know the new one is really faster and allocates less?
