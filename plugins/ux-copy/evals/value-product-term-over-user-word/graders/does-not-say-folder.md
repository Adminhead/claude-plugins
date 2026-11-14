---
type: regex
pattern: 'itemCap"\s*:\s*"[^"]*\b[Ff]olders?\b'
match: not_contains
weight: 2
target:
  source: file
  path: src/strings/en.json
---
