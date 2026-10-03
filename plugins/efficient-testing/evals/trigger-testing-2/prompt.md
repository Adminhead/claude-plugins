---
name: trigger-testing-2
description: A realistic request that should load efficient:testing.
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

I changed `apply_discount()` in billing/pricing.py so a discount can no longer push an order total below zero, and I touched `round_cents()` in billing/money.py. The repo has tests/billing/, tests/api/ and tests/e2e/. Which tests should I run and is there anything I need to add?
