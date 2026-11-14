---
type: regex
pattern: '\bisPending\b|keepPreviousData\s*[,}]|\bgcTime\b|useSuspenseQuery'
match: not_contains
weight: 3
target:
  source: file
  path: src/TodoList.tsx
---
