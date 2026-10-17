---
name: trigger-template-from-project
description: "Turning a project into a dotnet new template should load dotnet-template-authoring."
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

Turn src/Contoso.Worker into a reusable `dotnet new` template for the other teams. It must keep our Central Package Management setup, Nullable and TreatWarningsAsErrors, and let people choose between SqlServer and Postgres.
