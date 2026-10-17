---
name: blazor-vs-aspnet-core
description: "A minimal API endpoint does not load blazor (aspnet-core owns it)."
tags: [routing]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

Add a POST /api/orders minimal API endpoint to our ASP.NET Core Program.cs that validates the request body, returns ProblemDetails on validation errors, and returns 201 Created with a Location header.
