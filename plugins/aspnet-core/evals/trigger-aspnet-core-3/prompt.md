---
name: trigger-aspnet-core-3
description: Middleware order for CORS and auth in Program.cs should load aspnet-core.
tags: [trigger]
runs: 1
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
---

Our Program.cs calls app.UseAuthorization() before app.UseCors("web") and app.UseRateLimiter() before UseRouting(). The SPA gets CORS errors on authenticated calls and our per-endpoint rate limits never apply. Fix the pipeline order.
