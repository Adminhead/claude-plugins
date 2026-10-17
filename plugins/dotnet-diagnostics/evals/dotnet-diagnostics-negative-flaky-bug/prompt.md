---
name: dotnet-diagnostics-negative-flaky-bug
description: A logic bug with a reproducible wrong result does not route to dotnet-diagnostics.
tags: [routing, negative]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

Our C# invoice service sometimes rounds totals one cent off compared to the finance spreadsheet. It reproduces with the order in tests/fixtures/order-1187.json. Help me work out where the rounding goes wrong.
