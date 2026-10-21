---
type: llm
---

PASS only if all of these hold for the corrected task block in the response:

1. The version (or any other project value) is read into a local value during task configuration, outside the `doLast`/`doFirst` action, or passed as a provider input.
2. The action prints or uses the captured value and does not read `project` at execution time.
3. The explanation says the configuration cache serializes the task graph, so the action cannot touch `project` when a cached run executes it.

FAIL otherwise. Do not reward length or extra advice. Ignore formatting and whether the snippet is wrapped in a `tasks.register` block or uses `tasks.named`.
