---
type: regex
pattern: '(?=[\s\S]*export[^;]*?\bgroupByCustomer\b)(?=[\s\S]*export[^;]*?\bsortedByTotal\b)'
weight: 1
target:
  source: file
  path: src/report.mjs
---
