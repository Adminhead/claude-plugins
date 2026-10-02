---
name: trigger-test-gap-audit-1
description: A realistic request that should load quality:test-gap-audit.
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

Which parts of this repo lack tests? Here's the file listing:

```
src/auth/login.py
src/auth/tokens.py
src/billing/invoice.py
src/billing/refund.py
src/util/dates.py
tests/test_login.py
tests/test_dates.py
```
