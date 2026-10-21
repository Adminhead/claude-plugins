---
type: regex
pattern: '(^|run:\s*)sbt clean compile test'
flags: m
match: not_contains
target: last_message
---
