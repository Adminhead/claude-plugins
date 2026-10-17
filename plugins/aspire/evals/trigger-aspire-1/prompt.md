---
name: trigger-aspire-1
description: "A service failing under aspire run loads aspire."
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

When I start our Shop solution with `aspire run`, the dashboard shows `catalogapi` going Running, then Exited, then restarting over and over. Its console log ends with `Npgsql.NpgsqlException: Failed to connect to 127.0.0.1:5432`. Postgres shows as Running and healthy in the dashboard. The AppHost is in src/Shop.AppHost. How do I track this down and fix it?
