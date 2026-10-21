---
type: regex
pattern: 'jackson-databind</artifactId>\s*<version>'
match: not_contains
target:
  source: file
  path: app-core/pom.xml
---
