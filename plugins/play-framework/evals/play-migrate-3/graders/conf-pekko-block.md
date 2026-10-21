---
type: regex
pattern: '^pekko\s*\{[\s\S]*org\.apache\.pekko\.event\.slf4j'
flags: m
target:
  source: file
  path: conf/application.conf
---
