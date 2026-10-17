---
name: not-upgrade-nullable-fix
description: Fixing nullable warnings in existing C# code is csharp work, not an upgrade.
tags: [routing]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

I'm getting CS8602 and CS8618 warnings in OrderService.cs after someone turned on Nullable in this project months ago. Can you go through the class and fix them properly instead of sprinkling the ! operator everywhere?
