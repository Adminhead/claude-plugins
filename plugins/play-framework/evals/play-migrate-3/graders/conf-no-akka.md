---
type: regex
pattern: 'akka'
flags: i
match: not_contains
target:
  source: file
  path: conf/application.conf
---
