---
type: regex
pattern: '```[a-z]*\n[^`]*(?:\.close\(\)|\bis\s+["''])[^`]*```'
match: not_contains
weight: 2
target: last_message
---
