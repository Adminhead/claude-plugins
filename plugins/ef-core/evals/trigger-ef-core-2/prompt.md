---
name: trigger-ef-core-2
description: Adding and shipping an EF Core migration should load ef-core.
tags: [trigger]
runs: 1
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
---

I renamed the Customer.Phone property to PhoneNumber in our EF Core model. Create the migration, and tell me how we should apply it to production (we run three instances of the API that currently call Database.Migrate() at startup).
