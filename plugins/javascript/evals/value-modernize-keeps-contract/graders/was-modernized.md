---
type: regex
pattern: '\bvar\b|\.prototype\.'
match: not_contains
weight: 1
target:
  source: file
  path: src/settings.js
---
