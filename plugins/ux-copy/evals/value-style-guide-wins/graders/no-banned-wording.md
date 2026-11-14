---
type: regex
pattern: '!|\bCancel\b|\bOK\b|[Pp]lease|[Ss]orry|"title"\s*:\s*"[^"]*\?"'
match: not_contains
weight: 1
target:
  source: file
  path: src/strings/en.json
---
