---
type: regex
pattern: '(?:^|[,}\s])(?:html|body|main|\*)\s*(?:,[^{]*)?\{[^}]*overflow(?:-x)?\s*:\s*(?:hidden|clip)'
flags: i
match: not_contains
weight: 3
target:
  source: file
  path: product.html
---
