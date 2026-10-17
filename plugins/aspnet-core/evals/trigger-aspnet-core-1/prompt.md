---
name: trigger-aspnet-core-1
description: Adding a minimal API endpoint with OpenAPI metadata should load aspnet-core.
tags: [trigger]
runs: 1
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
---

In our .NET 10 web API (minimal APIs, Program.cs maps groups per resource), add endpoints to create and fetch a Supplier. The create endpoint should validate that Name is required and at most 200 characters and return 201 with a Location header. Make sure both show up properly in the OpenAPI document.
