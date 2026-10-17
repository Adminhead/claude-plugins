---
name: trigger-godot-csharp-3
description: "Hard negative: plain ASP.NET Core C# work with no Godot project; godot-csharp must stay quiet."
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

In our ASP.NET Core 8 API (src/Orders.Api/Orders.Api.csproj), OrderService.CreateAsync calls `_repo.SaveAsync(order).Result` and requests hang under load. Rewrite the method to be properly async with cancellation and explain the deadlock.
