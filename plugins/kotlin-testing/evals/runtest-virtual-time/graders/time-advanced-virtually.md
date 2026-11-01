---
type: llm
focus: { source: file, path: src/test/kotlin/acme/RetryingClientTest.kt }
weight: 3
---

Judge only the final test file.

PASS only if the tests cover first-call success, success after two failures and giving up after three, and check the elapsed time or the retry pauses through virtual time (for example `currentTime`, `advanceTimeBy`, `advanceUntilIdle`, or by relying on `runTest` skipping `delay`), with the dispatcher the class uses controlled by the test.

FAIL if any of the three scenarios is missing, if the tests would wait real seconds, or if the assertions would pass without the retry behavior. Do not reward length.
