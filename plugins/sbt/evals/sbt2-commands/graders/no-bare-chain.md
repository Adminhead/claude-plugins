---
type: regex
pattern: 'run:\s*sbt\s+(?:-\S+\s+)*(?:clean|compile|test|testFull)\s+(?:clean|compile|test|testFull)\b|run:\s*sbt\s+[^"''\n]*;'
match: not_contains
target:
  source: file
  path: .github/workflows/ci.yml
---
