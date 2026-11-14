---
name: value-two-defects-no-extras
description: Value case. A retry diff with two planted defects and an ugly but correct helper beside them; a good review-and-fix repairs exactly the defects and leaves the rest as written. Bare model only, the built-in code review is not available in the sandbox.
tags: [value]
runs: 3
max_turns: 6
allowed_tools: [Skill]
---

I finished the retry change on this branch. review it and fix whatever is wrong. give me the corrected code for everything in the diff that you changed, then a short list of what you changed.

```diff
--- a/src/net/fetch.py
+++ b/src/net/fetch.py
@@ -0,0 +1,32 @@
+import logging
+import time
+
+logger = logging.getLogger(__name__)
+
+
+class ServerError(Exception):
+    pass
+
+
+def _clean(d):
+    return {k: v for k, v in d.items() if v is not None}
+
+
+def fetch_with_retry(client, url, headers={}, max_retries=3, backoff=0.5):
+    delay = backoff
+    for attempt in range(max_retries):
+        headers["X-Retry-Attempt"] = str(attempt)
+        try:
+            resp = client.get(url, headers=_clean(headers), timeout=5)
+            if resp.status_code >= 500:
+                raise ServerError(resp.status_code)
+            return resp.json()
+        except (ServerError, TimeoutError) as exc:
+            logger.warning("attempt %d failed: %s", attempt, exc)
+            time.sleep(delay)
+            delay *= 2
```
