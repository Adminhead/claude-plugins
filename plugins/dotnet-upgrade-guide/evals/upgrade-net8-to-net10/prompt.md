---
name: upgrade-net8-to-net10
description: A request to move an ASP.NET Core app from net8.0 to net10.0 routes to dotnet-upgrade-guide.
tags: [routing]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

Our order API is an ASP.NET Core app on net8.0 with EF Core and a Dockerfile. We want to move it to .NET 10 this sprint. Walk me through doing the upgrade safely: what changes in the csproj, which breaking changes I should check for, and what else needs updating.
