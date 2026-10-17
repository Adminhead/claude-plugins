---
name: negative-template-use
description: "Using an existing template with dotnet new is not template authoring."
tags: [negative]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

Create a new xUnit test project for src/Billing with dotnet new and add it to Billing.slnx.
