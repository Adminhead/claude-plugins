---
name: dotnet-diagnostics-negative-benchmark
description: A BenchmarkDotNet and hot-path review request does not route to dotnet-diagnostics.
tags: [routing, negative]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

I rewrote our CSV parser in C# to use Span<char> instead of string.Split. Can you help me set up a BenchmarkDotNet comparison between the old and new versions with memory diagnostics, and review the new code for any remaining allocations in the hot loop?
