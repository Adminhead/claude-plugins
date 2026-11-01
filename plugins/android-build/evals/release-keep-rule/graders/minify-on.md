---
type: regex
pattern: 'isMinifyEnabled\s*=\s*false'
match: not_contains
target:
  source: file
  path: app/build.gradle.kts
---
