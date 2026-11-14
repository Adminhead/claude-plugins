---
type: regex
pattern: '"archiveBoard"\s*:\s*\{(?=[^}]*"title")(?=[^}]*"body")(?=[^}]*"confirm")(?=[^}]*"dismiss")'
weight: 1
target:
  source: file
  path: src/strings/en.json
---
