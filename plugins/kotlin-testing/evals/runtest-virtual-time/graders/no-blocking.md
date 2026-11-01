---
type: regex
pattern: 'Thread\.sleep|runBlocking'
match: not_contains
target:
  source: file
  path: src/test/kotlin/acme/RetryingClientTest.kt
---
