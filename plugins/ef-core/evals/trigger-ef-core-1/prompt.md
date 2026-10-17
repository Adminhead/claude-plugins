---
name: trigger-ef-core-1
description: An EF Core N+1 should load ef-core.
tags: [trigger]
runs: 1
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
---

OrderReportService loops over 2,000 orders and reads order.Customer.Name and order.Lines.Count for each one; the SQL log shows thousands of SELECTs. Rewrite the EF Core query so it runs in one or two round-trips.
