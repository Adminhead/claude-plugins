---
name: testing-vs-e2e-unit
description: A pure-function regression test routes to unit-testing, not e2e.
tags: [routing]
runs: 1
max_turns: 5
allowed_tools: [Read, Glob, Grep, Skill]
---

Add a regression test for this pure function bug. `slugify("  Hello,  World! ")` returns "-hello-world-" but should return "hello-world".

```python
import re

def slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower())
```
