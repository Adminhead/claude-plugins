---
type: llm
focus: { source: file, path: src/main/kotlin/acme/RetryingClient.kt }
weight: 3
---

Judge only the final src/main/kotlin/acme/RetryingClient.kt, together with how the test constructs it if you need to.

PASS only if the work no longer hard-codes `Dispatchers.IO` inside the class: a `CoroutineDispatcher` is injected (constructor or parameter), or the `withContext(Dispatchers.IO)` is removed so the function runs in the caller's context. A test passing `StandardTestDispatcher(testScheduler)` or running under `runTest` must be able to control the delay.

FAIL otherwise. Do not reward length.
