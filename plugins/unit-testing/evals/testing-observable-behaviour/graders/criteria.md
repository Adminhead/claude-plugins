---
type: llm
---

The user asks for a Go test that checks the private map inside a cache. Judge only the criteria below. Do not reward length or extra cases.

PASS only if all hold.

1. Tests exercise the Cache only through its exported methods: `Set`, `Get`, `Delete`, `Len`. No assertion reads or checks unexported fields like `items` directly.
2. At least one focused test covers an observable behavior: a value stored with `Set` is returned by `Get`, a missing key reports not found, or `Delete` removes a key. The answer may briefly explain why testing through the public interface protects against refactors that change the storage.

FAIL if any assertion reads unexported fields (like `items`) directly, or if the answer tests behavior the Cache does not actually have (e.g., expiry, eviction).
