---
name: trigger-testing-1
description: A realistic request that should load testing:unit.
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

I just fixed a bug in `parse_duration` in utils/time.py where "90s" returned 9 seconds because it stripped the trailing character and parsed the rest as minutes. The fix is in. Please cover it with a test so it can't come back. The existing tests live in tests/test_time.py and use pytest.
