---
name: trigger-aspnet-core-2
description: Global error handling in ASP.NET Core should load aspnet-core.
tags: [trigger]
runs: 1
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
---

Every controller action in our ASP.NET Core 9 API has its own try/catch that returns 500 with ex.Message. Replace that with one global handler that maps our NotFoundException to 404 and ConflictException to 409 as RFC 7807 problem details, without leaking internal error text.
