---
type: regex
pattern: '(trait|object|class|enum)\s+\w+[^\n{]*:\s*$'
flags: m
match: not_contains
target:
  source: file
  path: src/main/scala/shapes/Shapes.scala
---
