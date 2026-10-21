---
type: regex
pattern: 'run:\s*sbt\s+.*testFull'
weight: 2
target:
  source: file
  path: .github/workflows/ci.yml
---
