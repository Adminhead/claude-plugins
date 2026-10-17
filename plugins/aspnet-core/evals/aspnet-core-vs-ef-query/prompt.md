---
name: aspnet-core-vs-ef-query
description: An EF Core N+1 inside a service should not load aspnet-core.
tags: [routing]
runs: 1
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
---

OrderReportService loops over 2,000 orders and reads order.Customer.Name and order.Lines.Count for each one; the SQL log shows thousands of SELECTs. Rewrite the EF Core query so it runs in one or two round-trips.
