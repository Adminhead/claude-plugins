---
type: regex
pattern: 'triplet\.play|libs\.plugins\.[\w.]*play|\bplay\s*\{'
target:
  source: file
  path: app/build.gradle.kts
---
