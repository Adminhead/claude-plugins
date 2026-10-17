---
name: trigger-ef-core-3
description: Dapper code with cancellation and multi-mapping should load ef-core.
tags: [trigger]
runs: 1
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
---

Our InvoiceRepository uses Dapper alongside EF Core. GetWithLinesAsync joins invoices to invoice_lines but returns one Invoice per line, ignores the CancellationToken, and builds the ORDER BY from a query-string value. Fix it.
