---
type: regex
pattern: '-dontobfuscate|-dontshrink|-dontoptimize|-keep\s+class\s+\*\*|-keep\s+class\s+com\.acme\.\*\*\s*\{\s*\*;'
match: not_contains
target:
  source: file
  path: app/proguard-rules.pro
---
