---
type: regex
pattern: 'com\.typesafe\.(play|akka)'
match: not_contains
target:
  source: file
  path: build.sbt
---
