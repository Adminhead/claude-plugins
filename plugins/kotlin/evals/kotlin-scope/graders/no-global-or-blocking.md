---
type: regex
pattern: 'GlobalScope|runBlocking'
match: not_contains
target:
  source: file
  path: src/main/kotlin/sync/SyncService.kt
---
