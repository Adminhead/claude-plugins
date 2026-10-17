---
name: trigger-dotnet-testing-2
description: Making DateTime.UtcNow code testable in C# should load dotnet-testing.
tags: [trigger]
runs: 1
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
---

TokenIssuer.cs sets `ExpiresAt = DateTime.UtcNow.AddMinutes(15)` and IsExpired compares against DateTime.UtcNow. I need NUnit tests for the expiry boundary that do not sleep or depend on the real clock. Change the class as little as possible and keep its public constructor.
