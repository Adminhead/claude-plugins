---
type: regex
pattern: '^(?!\s*(?://|/?\*)).*(?:Object\.groupBy|Map\.groupBy|\.toSorted|\.toReversed|\.toSpliced)\('
flags: m
match: not_contains
weight: 3
target:
  source: file
  path: src/report.mjs
---
