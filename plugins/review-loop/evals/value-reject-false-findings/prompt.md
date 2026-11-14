---
name: value-reject-false-findings
description: Value case. Three bot review comments, one real and two wrong; a good fix pass repairs the real one and declines the others with a reason. Bare model only, the built-in code review is not available in the sandbox.
tags: [value]
runs: 3
max_turns: 6
allowed_tools: [Skill]
---

a linter bot left three comments on my PR. fix what's actually wrong in the code, then give me the final `get_user` as one code block and one line per comment saying what you did about it.

1. SQL is built with an f-string.
2. The file handle `f` is never closed.
3. A string is compared with `==`; use `is` instead.

```python
import json


def get_user(db, email):
    row = db.execute(f"SELECT id, role FROM users WHERE email = '{email}'").fetchone()
    if row is None:
        return None
    with open("roles.json") as f:
        roles = json.load(f)
    if roles.get(row["role"]) == "admin":
        return {"id": row["id"], "admin": True}
    return {"id": row["id"], "admin": False}
```
