---
type: llm
---

The diff has two real defects: a mutable default argument that the function then mutates, and a retry loop that falls off the end and returns None once every attempt has failed. Everything else is working code.

PASS only if all of these hold:

1. The change list names both defects and the corrected code fixes both.
2. The corrected code keeps the function name, parameter names and order, `ServerError`, the timeout value, the backoff constants and the log message exactly as in the diff, apart from what the two fixes need.
3. `_clean` is either not shown or shown unchanged, and the response does not rename, restructure or add features (a jitter, a new exception class unrelated to the fix, type hints, docstrings) beyond the two fixes.
4. The response does not claim other bugs in code that works.

FAIL otherwise. Do not reward length.
