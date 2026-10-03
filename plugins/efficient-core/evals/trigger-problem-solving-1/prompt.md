---
name: trigger-problem-solving-1
description: A realistic request that should load efficient-core:problem-solving.
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

This test is green on my machine but red on the CI runner roughly one run in five. Here's the log from a failing run:

```
tests/test_cache.py::test_entry_expires FAILED
E   assert cache.get('a') is None
E   AssertionError: assert 'x' is None
tests/test_cache.py:22: AssertionError
============ 1 failed, 212 passed in 18.4s (runner: ubuntu, 2 vCPU) ============
```

The test sets a 1 second TTL, sleeps 1.0 seconds, then asserts the entry is gone. Nothing else has changed.
