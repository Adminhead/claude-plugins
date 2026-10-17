---
name: csharp-nullable-warnings
description: CS86xx warnings in an existing service class route to csharp, not dotnet-upgrade-guide.
tags: [routing]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

After turning on <Nullable>enable</Nullable> in our Orders project I get CS8618 on `public string CustomerName { get; set; }` in OrderDto, CS8603 on `return _cache.GetValueOrDefault(key);` in OrderLookup.FindOrder, and CS8602 in OrderService where we call `order.Lines.Count`. What is the right fix for each without changing runtime behavior?
