---
type: regex
pattern: '\w*[Rr]ename\w*\.(?:isLoading|status)\b|isLoading\s*:\s*\w+[^}]*\}\s*=\s*rename'
weight: 1
target:
  source: file
  path: src/TodoList.tsx
---
