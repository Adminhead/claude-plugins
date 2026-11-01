---
type: llm
focus: { source: file, path: src/main/kotlin/sync/SyncService.kt }
weight: 3
---

Judge only the final src/main/kotlin/sync/SyncService.kt.

PASS only if all hold:
1. The periodic loop is launched in a `CoroutineScope` that the class owns or receives (a `Job`/`SupervisorJob` it holds, or an injected scope), not in a global scope.
2. There is a way to stop the work (for example a `stop()`/`close()` that cancels the job or scope).
3. `flush` no longer blocks the calling thread: it is a `suspend` function, or it launches in the owned scope.

FAIL otherwise. Do not reward length.
