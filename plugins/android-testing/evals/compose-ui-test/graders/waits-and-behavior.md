---
type: llm
focus: { source: file, path: app/src/androidTest/java/com/acme/items/ItemListScreenTest.kt }
weight: 3
---

Judge only the final ItemListScreenTest.kt.

PASS only if all hold:
1. The wait for the rows to appear is a condition, not a duration: `waitUntil`, `waitUntilExactlyOneExists`/`waitUntilAtLeastOneExists`, an idling resource, or the state being set before `setContent` (so no wait is needed). No `Thread.sleep` or `delay` stands in for it.
2. At least one assertion is about behavior: the click callback received "b2" (or another id), or a node exists, does not exist, or is enabled.
3. The test does not assert that a node's displayed text equals a particular string as its purpose. Using text (or a tag) only to find the node to click is fine.

FAIL otherwise. Do not reward length.
