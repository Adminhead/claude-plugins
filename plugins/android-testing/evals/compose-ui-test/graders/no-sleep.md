---
type: regex
pattern: 'Thread\.sleep'
match: not_contains
target:
  source: file
  path: app/src/androidTest/java/com/acme/items/ItemListScreenTest.kt
---
