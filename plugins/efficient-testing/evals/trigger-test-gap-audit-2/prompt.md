---
name: trigger-test-gap-audit-2
description: A realistic request that should load efficient-testing:gap-audit.
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

We're about to ship a PR that adds a bulk-delete route to the orders API (src/api/orders.py, new `delete_many`). tests/api/test_orders.py only covers create and get. Is our test coverage for this enough, and what regression tests are missing?
