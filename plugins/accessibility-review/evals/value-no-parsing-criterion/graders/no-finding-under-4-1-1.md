---
type: regex
pattern: '^[\s>*|`\-\d.]*\**\s*(?:SC\s*)?4\.1\.1\b(?![^\n]*(?:remov|obsolete|no longer|deprecat|retired|dropped|n/a))'
flags: im
match: not_contains
weight: 3
target: last_message
---
