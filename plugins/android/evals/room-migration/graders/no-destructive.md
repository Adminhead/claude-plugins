---
type: regex
pattern: 'fallbackToDestructiveMigration\s*\('
match: not_contains
target:
  source: file
  path: app/src/main/java/com/example/data/AppDatabase.kt
---
