---
type: llm
weight: 1
focus:
  source: file
  path: src/report.mjs
---

Judge only the code in the file.

PASS only if all of these hold:

1. `groupByCustomer` returns an object (or a null-prototype object) keyed by customer name, and each value holds every order of that customer.
2. `sortedByTotal` returns a new array ordered from the highest `total` to the lowest.
3. Neither function reorders or otherwise mutates the array it receives. An in-place `.sort()` or `.reverse()` on the argument itself does not count; on a copy it does.

FAIL otherwise. Do not reward comments, tests or length. Ignore which built-ins are used.
