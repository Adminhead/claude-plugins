---
type: regex
pattern: 'lorem ipsum|dolor sit amet'
flags: i
match: not_contains
target: { source: file, path: index.html }
---
