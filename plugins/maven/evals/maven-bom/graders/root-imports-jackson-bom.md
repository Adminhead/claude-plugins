---
type: regex
pattern: '(jackson-bom[\s\S]*<scope>import</scope>|<dependencyManagement>[\s\S]*jackson-databind</artifactId>[\s\S]*</dependencyManagement>)'
target:
  source: file
  path: pom.xml
---
